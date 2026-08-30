import { config } from "dotenv";
import { expect, test } from "@playwright/test";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.local" });

/**
 * FIX_PLAN.md item 30(e) : gestion des tournées non couverte par la suite
 * E2E, maintenant que la persistance réelle existe (P0-2, Sprint 1 —
 * auparavant un état local simulé qui ne survivait pas au rechargement).
 * Les actions de tournée/zone exigent la permission MANAGE_PUBLIC_SETTINGS,
 * que le compte de test n'a pas par défaut — accordée temporairement, comme
 * dans tests/notifications-toasts.spec.ts.
 */

const testEmail = "praticien-test@pf-osteo-animale.fr";
const testPassword = "Praticien-Test-2026!";
const testZoneName = "Zone E2E Tournées";
const testTourName = "Tournée E2E Test";

async function grantPermission() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`UPDATE "User" SET permissions = ARRAY['MANAGE_PUBLIC_SETTINGS'] WHERE email = ${testEmail}`;
}

async function revokePermission() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`UPDATE "User" SET permissions = ARRAY[]::text[] WHERE email = ${testEmail}`;
}

async function cleanup() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`DELETE FROM "Tour" WHERE name LIKE ${testTourName + "%"}`;
  await sql`DELETE FROM "Zone" WHERE name = ${testZoneName}`;
}

test.describe("Gestion des tournées", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async () => {
    await grantPermission();
  });

  test.afterAll(async () => {
    await cleanup();
    await revokePermission();
  });

  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', testPassword);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard**", { timeout: 10000 });
    await page.goto("/dashboard/tournees");
  });

  test("créer une zone puis une tournée les persiste réellement en base", async ({ page }) => {
    // Zone d'abord : une tournée exige une zone existante.
    await page.getByRole("button", { name: "Nouvelle zone" }).click();
    let dialog = page.locator('[role="dialog"]').first();
    await dialog.getByPlaceholder("Ex. Zone Le Havre").fill(testZoneName);
    await dialog.getByPlaceholder("Ville").fill("Yvetot");
    await dialog.getByPlaceholder("Code postal").fill("76190");
    await dialog.getByRole("button", { name: "Créer la zone" }).click();
    await expect(dialog).toHaveCount(0, { timeout: 10000 });

    const sql = neon(process.env.DATABASE_URL!);
    const [zone] = await sql`SELECT id, name FROM "Zone" WHERE name = ${testZoneName}`;
    expect(zone).toBeTruthy();

    await page.getByRole("button", { name: "Créer une tournée" }).click();
    dialog = page.locator('[role="dialog"]').first();
    await dialog.getByPlaceholder("Ex. Tournée Le Havre").fill(testTourName);
    await dialog.locator("select").filter({ has: page.locator(`option:has-text("${testZoneName}")`) }).selectOption({ label: testZoneName });
    await dialog.getByRole("button", { name: "Créer la tournée" }).click();
    await expect(dialog).toHaveCount(0, { timeout: 10000 });

    const [tour] = await sql`SELECT name, "zoneId", status FROM "Tour" WHERE name = ${testTourName}`;
    expect(tour).toBeTruthy();
    expect(tour.zoneId).toBe(zone.id);
    expect(tour.status).toBe("ACTIVE");
    await expect(page.getByText(testTourName).first()).toBeVisible();
  });

  test("désactiver puis réactiver une tournée persiste réellement le changement de statut", async ({ page }) => {
    const sql = neon(process.env.DATABASE_URL!);
    const [zone] = await sql`SELECT id FROM "Zone" WHERE name = ${testZoneName}`;
    const [existing] = await sql`SELECT id FROM "Tour" WHERE name = ${testTourName}`;
    if (!existing) {
      await sql`INSERT INTO "Tour" (id, name, recurrence, day, "dateLabel", "startTime", "endTime", "zoneId", status, "consultationHours") VALUES ('tmp-e2e-tour', ${testTourName}, 'Toutes les semaines', 'Lundi', 'Tous les lundis', '09:00', '18:00', ${zone.id}, 'ACTIVE', '09:00 - 18:00')`;
      await page.reload();
    }

    const heading = page.locator("h3", { hasText: testTourName });
    const card = heading.locator("xpath=ancestor::*[contains(@class,'rounded-')][1]");
    await card.getByRole("button", { name: "Désactiver" }).click();
    await page.waitForTimeout(800);

    const [afterDisable] = await sql`SELECT status FROM "Tour" WHERE name = ${testTourName}`;
    expect(afterDisable.status).toBe("INACTIVE");
    await expect(card.getByRole("button", { name: "Activer" })).toBeVisible();

    await card.getByRole("button", { name: "Activer" }).click();
    await page.waitForTimeout(800);
    const [afterEnable] = await sql`SELECT status FROM "Tour" WHERE name = ${testTourName}`;
    expect(afterEnable.status).toBe("ACTIVE");
  });

  test("modifier une tournée existante persiste réellement le changement", async ({ page }) => {
    const sql = neon(process.env.DATABASE_URL!);
    const [zone] = await sql`SELECT id FROM "Zone" WHERE name = ${testZoneName}`;
    const [existing] = await sql`SELECT id FROM "Tour" WHERE name = ${testTourName}`;
    if (!existing) {
      await sql`INSERT INTO "Tour" (id, name, recurrence, day, "dateLabel", "startTime", "endTime", "zoneId", status, "consultationHours") VALUES ('tmp-e2e-tour2', ${testTourName}, 'Toutes les semaines', 'Lundi', 'Tous les lundis', '09:00', '18:00', ${zone.id}, 'ACTIVE', '09:00 - 18:00')`;
      await page.reload();
    }

    const heading = page.locator("h3", { hasText: testTourName });
    const card = heading.locator("xpath=ancestor::*[contains(@class,'rounded-')][1]");
    await card.getByRole("button", { name: "Modifier" }).click();
    const dialog = page.locator('[role="dialog"]').first();
    await dialog.locator('input[value="' + testTourName + '"]').fill(testTourName + " Modifiée");
    await dialog.getByRole("button", { name: "Enregistrer" }).click();
    await expect(dialog).toHaveCount(0, { timeout: 10000 });

    const [tour] = await sql`SELECT name FROM "Tour" WHERE name = ${testTourName + " Modifiée"}`;
    expect(tour).toBeTruthy();
    await expect(page.getByText(testTourName + " Modifiée").first()).toBeVisible();
  });
});
