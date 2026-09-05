import { config } from "dotenv";
import { expect, test } from "@playwright/test";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.local" });

/**
 * Liste clients : la suppression individuelle par bouton (visible sur
 * chaque ligne) est retirée au profit d'une sélection façon Gmail (case à
 * cocher → bandeau d'action groupée) — jamais de bouton de suppression
 * visible directement sur une fiche. Les cases à cocher elles-mêmes restent
 * masquées tant que le mode sélection n'est pas activé via le bouton
 * "Sélectionner".
 */

const testEmail = "praticien-test@pf-osteo-animale.fr";
const testPassword = "Praticien-Test-2026!";
const testLastNamePrefix = "E2EBulkDeleteTest";

async function seedClients(count: number) {
  const sql = neon(process.env.DATABASE_URL!);
  for (let index = 0; index < count; index += 1) {
    await sql`INSERT INTO "Client" (id, "firstName", "lastName", phone, email, city, address, "updatedAt") VALUES (${`tmp-bulk-del-${index}`}, 'Prénom', ${`${testLastNamePrefix}${index}`}, '0600000000', ${`bulk-del-${index}@example.fr`}, 'Rouen', '1 rue Test', now())`;
  }
}

async function cleanupClients() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`DELETE FROM "Client" WHERE "lastName" LIKE ${testLastNamePrefix + "%"}`;
}

async function clearLoginRateLimit() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`DELETE FROM "RateLimitEvent" WHERE key LIKE 'login:%'`;
}

// Le compte de test n'a par défaut aucune permission (permissions: []) —
// DELETE_CLIENTS doit être accordée explicitement pour exercer la
// suppression groupée, comme les autres specs qui touchent une permission
// (voir business-profile-geocoding.spec.ts, tour-detail-itinerary.spec.ts).
async function grantDeletePermission() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`UPDATE "User" SET permissions = ARRAY['DELETE_CLIENTS'] WHERE email = ${testEmail}`;
}

async function revokeDeletePermission() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`UPDATE "User" SET permissions = ARRAY[]::text[] WHERE email = ${testEmail}`;
}

test.describe("Clients — suppression groupée façon Gmail", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async () => {
    await grantDeletePermission();
  });

  test.afterAll(async () => {
    await revokeDeletePermission();
  });

  test.beforeEach(async ({ page }) => {
    await cleanupClients();
    await clearLoginRateLimit();
    await page.goto("/login");
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', testPassword);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard**", { timeout: 10000 });
  });

  test.afterEach(async () => {
    await cleanupClients();
  });

  test("aucun bouton de suppression ni case à cocher visible avant d'activer la sélection", async ({ page }) => {
    await seedClients(1);
    await page.goto(`/dashboard/clients?q=${testLastNamePrefix}`);
    await page.waitForTimeout(600);
    await expect(page.getByText(`Prénom ${testLastNamePrefix}0`).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Supprimer/ })).toHaveCount(0);
    await expect(page.locator('input[type="checkbox"]')).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Sélectionner" })).toBeVisible();
  });

  test("le bouton Sélectionner fait apparaître les cases à cocher", async ({ page }) => {
    await seedClients(1);
    await page.goto(`/dashboard/clients?q=${testLastNamePrefix}`);
    await page.waitForTimeout(600);

    await page.getByRole("button", { name: "Sélectionner" }).click();
    await expect(page.getByRole("checkbox", { name: `Sélectionner Prénom ${testLastNamePrefix}0` })).toBeVisible();

    await page.getByRole("button", { name: "Terminé" }).click();
    await expect(page.locator('input[type="checkbox"]')).toHaveCount(0);
  });

  test("sélectionner plusieurs clients puis confirmer les supprime réellement en base", async ({ page }) => {
    await seedClients(3);
    const sql = neon(process.env.DATABASE_URL!);

    await page.goto(`/dashboard/clients?q=${testLastNamePrefix}`);
    await page.waitForTimeout(600);
    await page.getByRole("button", { name: "Sélectionner" }).click();

    for (let index = 0; index < 3; index += 1) {
      await page.getByRole("checkbox", { name: `Sélectionner Prénom ${testLastNamePrefix}${index}` }).check();
    }

    await expect(page.getByText("3 clients sélectionnés")).toBeVisible();

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Supprimer" }).click();

    await expect(page.getByText("3 clients ont été supprimés.")).toBeVisible({ timeout: 10000 });

    const remaining = await sql`SELECT count(*) FROM "Client" WHERE "lastName" LIKE ${testLastNamePrefix + "%"}`;
    expect(Number(remaining[0].count)).toBe(0);
  });

  test("désélectionner referme le bandeau sans rien supprimer", async ({ page }) => {
    await seedClients(1);
    const sql = neon(process.env.DATABASE_URL!);

    await page.goto(`/dashboard/clients?q=${testLastNamePrefix}`);
    await page.waitForTimeout(600);
    await page.getByRole("button", { name: "Sélectionner" }).click();

    await page.getByRole("checkbox", { name: `Sélectionner Prénom ${testLastNamePrefix}0` }).check();
    await expect(page.getByText("1 client sélectionné")).toBeVisible();
    await page.getByRole("button", { name: "Désélectionner" }).click();
    await expect(page.getByText("1 client sélectionné")).toHaveCount(0);

    const remaining = await sql`SELECT count(*) FROM "Client" WHERE "lastName" LIKE ${testLastNamePrefix + "%"}`;
    expect(Number(remaining[0].count)).toBe(1);
  });
});
