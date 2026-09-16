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

/**
 * Sa propre zone utilisée par une tournée plutôt qu'une dépendance aux
 * données de démo ("Zone Dieppe") : cette base de dev n'a pas toujours de
 * zones pré-existantes, le test doit rester autonome pour déclencher le
 * rejet de suppression (contrainte de clé étrangère) de façon fiable.
 */


async function grantPublicSettingsPermission() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`UPDATE "User" SET permissions = ARRAY['MANAGE_PUBLIC_SETTINGS'] WHERE email = ${testEmail}`;
}

async function revokePublicSettingsPermission() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`UPDATE "User" SET permissions = ARRAY[]::text[] WHERE email = ${testEmail}`;
}

test.describe("Système de notifications (toasts)", () => {
  // Session ouverte une fois par le projet « setup » (tests/auth.setup.ts) :
  // se reconnecter à chaque test épuisait le quota de connexions du serveur
  // (10 par quart d'heure et par compte) et faisait échouer des tests
  // parfaitement corrects.
  test("un toast de succès disparaît automatiquement après ~4s", async ({ page }) => {
    await grantPublicSettingsPermission();
    const sql = neon(process.env.DATABASE_URL!);

    // Les zones se règlent dans Paramètres › Tournées depuis la refonte des
    // tournées ; la page /dashboard/tournees ne porte plus que les journées.
    await page.goto("/dashboard/parametres?tab=tours");
    // Les zones vivent dans un panneau latéral ouvert depuis les réglages de
    // tournées, et non plus sur la page Tournées elle-même.
    await page.getByRole("button", { name: /^Zones \(/ }).click();
    await page.getByRole("button", { name: "+ Nouvelle zone" }).click();
    // Deux dialogues empilés : le panneau des zones, puis la fenêtre de
    // création — on vise celle qui porte le formulaire.
    const dialog = page.locator('[role="dialog"]').filter({ has: page.getByPlaceholder("Ex. Zone Le Havre") });
    await dialog.getByPlaceholder("Ex. Zone Le Havre").fill("Zone E2E Toast");
    await dialog.getByPlaceholder("Ville").fill("Yvetot");
    await dialog.getByPlaceholder("Code postal").fill("76190");
    await dialog.getByRole("button", { name: "Créer la zone" }).click();

    const toast = page.locator('[data-sonner-toast][data-type="success"]');
    await expect(toast).toBeVisible();
    // Message réel de tours-settings-tab.tsx : le libellé attendu ici datait
    // d'une version antérieure.
    await expect(toast).toContainText("Zone créée.");

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
    // Erreur réellement atteignable : déplacer un rendez-vous sur un créneau
    // déjà occupé. L'ancien scénario (supprimer une zone utilisée par une
    // tournée) ne l'est plus — l'interface propose une réassignation au lieu
    // de laisser le serveur refuser, et les réglages publics sont désactivés
    // faute de permission plutôt que rejetés à l'envoi.
    const sql = neon(process.env.DATABASE_URL!);
    const dateId = new Date().toISOString().slice(0, 10);
    const names = ["E2E Toast A", "E2E Toast B"];
    await sql`DELETE FROM "Appointment" WHERE "clientName" = ANY(${names})`;
    await sql`INSERT INTO "Appointment" ("id", "date", "start", "duration", "clientName", "animalName", "serviceName", "mode", "location", "price", "status", "notes", "createdAt", "updatedAt")
      VALUES (${`e2e-toast-a-${Date.now()}`}, ${`${dateId}T00:00:00.000Z`}, '09:00', 60, ${names[0]}, 'Alpha', 'Séance', 'CABINET', 'Cabinet', 60, 'CONFIRMED', '', now(), now()),
             (${`e2e-toast-b-${Date.now()}`}, ${`${dateId}T00:00:00.000Z`}, '11:00', 60, ${names[1]}, 'Beta', 'Séance', 'CABINET', 'Cabinet', 60, 'CONFIRMED', '', now(), now())`;

    try {
      await page.goto("/dashboard/agenda");
      const source = page.getByTestId("agenda-event").filter({ hasText: "Beta" }).first();
      const target = page.getByTestId("agenda-event").filter({ hasText: "Alpha" }).first();
      await expect(source).toBeVisible({ timeout: 15000 });

      // hover() d'abord : il fait défiler la cible dans la vue et place le
      // pointeur sur l'élément réel, là où des coordonnées calculées peuvent
      // tomber à côté après un défilement.
      await source.hover();
      const from = (await source.boundingBox())!;
      const to = (await target.boundingBox())!;
      await page.mouse.down();
      for (let step = 1; step <= 8; step += 1) {
        await page.mouse.move(to.x + to.width / 2, from.y + from.height / 2 + ((to.y + to.height / 2 - from.y - from.height / 2) * step) / 8, { steps: 2 });
        await page.waitForTimeout(40);
      }
      await page.mouse.up();

      const toast = page.locator('[data-sonner-toast][data-type="error"]');
      await expect(toast).toBeVisible({ timeout: 10000 });
      await expect(toast).toContainText("n’est pas disponible");

      // Toujours là bien après la durée d'auto-dismiss des succès (4s).
      await page.waitForTimeout(5000);
      await expect(toast).toBeVisible();

      await toast.getByRole("button", { name: "Close toast" }).click();
      await expect(toast).toHaveCount(0);
    } finally {
      await sql`DELETE FROM "Appointment" WHERE "clientName" = ANY(${names})`;
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
