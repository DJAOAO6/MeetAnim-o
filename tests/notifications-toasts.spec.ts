import { config } from "dotenv";
import { expect, test } from "@playwright/test";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.local" });

/**
 * PROMPT-NOTIFICATIONS.md Partie A : vérifie le système de toasts unifié
 * (src/lib/notify.ts + Sonner monté une seule fois dans le layout dashboard).
 * Les scénarios s'appuient sur des actions réelles de l'UI (comme le reste
 * de la suite E2E) plutôt que d'appeler notify.* directement, afin de tester
 * le comportement effectivement vu par l'utilisateur.
 *
 * Les zones/tournées sont réellement persistées en base (AUDIT_COMPLET.md
 * P0-2) et leurs actions requièrent la permission MANAGE_PUBLIC_SETTINGS,
 * que le compte de test n'a pas par défaut : elle est accordée temporairement
 * pour les deux scénarios qui s'appuient sur des actions de zone.
 */

const testEmail = "praticien-test@pf-osteo-animale.fr";
const testZoneId = "tmp-toast-zone";
const testTourId = "tmp-toast-tour";

/**
 * Sa propre zone utilisée par une tournée plutôt qu'une dépendance aux
 * données de démo ("Zone Dieppe") : cette base de dev n'a pas toujours de
 * zones pré-existantes, le test doit rester autonome pour déclencher le
 * rejet de suppression (contrainte de clé étrangère) de façon fiable.
 */
async function seedZoneUsedByTour() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`INSERT INTO "Zone" (id, name) VALUES (${testZoneId}, 'Zone E2E Toast Erreur')`;
  await sql`INSERT INTO "Tour" (id, name, recurrence, day, "dateLabel", "startTime", "endTime", "zoneId", status) VALUES (${testTourId}, 'Tournée E2E Toast Erreur', 'Toutes les semaines', 'Lundi', 'test', '08:00', '18:00', ${testZoneId}, 'ACTIVE')`;
}

async function cleanupZoneUsedByTour() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`DELETE FROM "Tour" WHERE id = ${testTourId}`;
  await sql`DELETE FROM "Zone" WHERE id = ${testZoneId}`;
}

async function grantPublicSettingsPermission() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`UPDATE "User" SET permissions = ARRAY['MANAGE_PUBLIC_SETTINGS'] WHERE email = ${testEmail}`;
}

async function revokePublicSettingsPermission() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`UPDATE "User" SET permissions = ARRAY[]::text[] WHERE email = ${testEmail}`;
}

test.describe("Système de notifications (toasts)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', "Praticien-Test-2026!");
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard**", { timeout: 10000 });
  });

  test("un toast de succès disparaît automatiquement après ~4s", async ({ page }) => {
    await grantPublicSettingsPermission();
    const sql = neon(process.env.DATABASE_URL!);

    await page.goto("/dashboard/tournees");
    await page.getByRole("button", { name: "Nouvelle zone" }).click();
    const dialog = page.locator('[role="dialog"]').first();
    await dialog.getByPlaceholder("Ex. Zone Le Havre").fill("Zone E2E Toast");
    await dialog.getByPlaceholder("Ville").fill("Yvetot");
    await dialog.getByPlaceholder("Code postal").fill("76190");
    await dialog.getByRole("button", { name: "Créer la zone" }).click();

    const toast = page.locator('[data-sonner-toast][data-type="success"]');
    await expect(toast).toBeVisible();
    await expect(toast).toContainText("Zone E2E Toast a été créée.");

    // Toujours présent juste avant l'échéance des 4s...
    await page.waitForTimeout(3500);
    await expect(toast).toBeVisible();

    // ...disparu après.
    await page.waitForTimeout(1500);
    await expect(toast).toHaveCount(0);

    // La zone est désormais réellement écrite en base (P0-2) : nettoyage.
    await sql`DELETE FROM "Zone" WHERE name = 'Zone E2E Toast'`;
    await revokePublicSettingsPermission();
  });

  test("un toast d'erreur reste affiché jusqu'à fermeture manuelle", async ({ page }) => {
    // Une zone utilisée par une tournée : sa suppression est rejetée côté
    // serveur (contrainte de clé étrangère), ce qui déclenche notify.error.
    await grantPublicSettingsPermission();
    await cleanupZoneUsedByTour();
    await seedZoneUsedByTour();

    try {
      await page.goto("/dashboard/tournees");
      await page.getByRole("button", { name: "Supprimer", exact: true }).click();

      const toast = page.locator('[data-sonner-toast][data-type="error"]');
      await expect(toast).toBeVisible();
      await expect(toast).toContainText("ne peut pas être supprimée");

      // Toujours là bien après la durée d'auto-dismiss des succès (4s).
      await page.waitForTimeout(5000);
      await expect(toast).toBeVisible();

      await toast.getByRole("button", { name: "Close toast" }).click();
      await expect(toast).toHaveCount(0);
    } finally {
      await cleanupZoneUsedByTour();
      await revokePublicSettingsPermission();
    }
  });

  test("plusieurs actions rapides empilent les toasts sans perte", async ({ page }) => {
    await page.goto("/dashboard/clients");
    await page.locator('a[href^="/dashboard/clients/"]').first().click();
    const uploadButton = page.getByRole("button", { name: "Téléverser un document" });

    // Trois déclenchements rapprochés du même toast info (stub documents,
    // encore en attente des identifiants de stockage — voir AnimalSideCards) :
    // chacun doit produire son propre toast, aucun perdu.
    await uploadButton.click();
    await uploadButton.click();
    await uploadButton.click();

    await expect(page.locator('[data-sonner-toast][data-type="info"]')).toHaveCount(3);
  });

  test("le toast est annoncé aux technologies d'assistance via une région live", async ({ page }) => {
    await page.goto("/dashboard/clients");
    await page.locator('a[href^="/dashboard/clients/"]').first().click();
    await page.getByRole("button", { name: "Téléverser un document" }).click();

    const liveRegion = page.locator('[aria-live="polite"]').filter({ has: page.locator('[data-sonner-toast]') });
    await expect(liveRegion).toHaveCount(1);
    await expect(liveRegion.locator('[data-sonner-toast]')).toContainText("simulation locale");
  });
});
