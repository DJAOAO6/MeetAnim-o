import { config } from "dotenv";
import { expect, test } from "@playwright/test";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.local" });

/**
 * Refonte tournées, prérequis 0.2/0.3 : coordinatesForCity() ne doit plus
 * faire atterrir un client d'une ville inconnue à Rouen par défaut — il doit
 * être exclu de la carte (position inconnue) plutôt que mal positionné.
 * "Caen" est une vraie ville normande absente des 13 villes codées en dur
 * dans src/data/normandy-cities.ts.
 */

const testEmail = "praticien-test@pf-osteo-animale.fr";
const testPassword = "Praticien-Test-2026!";
const testClientId = "tmp-geo-p0-client";
const testAnimalId = "tmp-geo-p0-animal";
const uniqueAnimalName = "GeoP0TestAnimal";
const uniqueLastName = "E2EGeoP0Test";

async function seedClientOutsideKnownCities() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`INSERT INTO "Client" (id, "firstName", "lastName", phone, email, city, address, "updatedAt") VALUES (${testClientId}, 'Prénom', ${uniqueLastName}, '0600000000', 'geo-p0-e2e@example.fr', 'Caen', '1 rue Test', now())`;
  await sql`INSERT INTO "Animal" (id, "clientId", name, species, breed, age, weight, sex, avatar, "avatarBackground", history, conditions, treatments, notes, "updatedAt") VALUES (${testAnimalId}, ${testClientId}, ${uniqueAnimalName}, 'Chien', '', '', '', '', '', '', '', '', '', '', now())`;
}

async function cleanupData() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`DELETE FROM "Animal" WHERE id = ${testAnimalId}`;
  await sql`DELETE FROM "Client" WHERE id = ${testClientId}`;
}

async function clearLoginRateLimit() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`DELETE FROM "RateLimitEvent" WHERE key LIKE 'login:%'`;
}

test.describe("Carte clients — pas de repli sur Rouen pour une ville inconnue (Phase 0)", () => {
  test.beforeEach(async ({ page }) => {
    await cleanupData();
    await seedClientOutsideKnownCities();
    await clearLoginRateLimit();
    await page.goto("/login");
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', testPassword);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard**", { timeout: 10000 });
  });

  test.afterEach(async () => {
    await cleanupData();
  });

  test("un client d'une ville hors de la liste des 13 villes est listé mais absent de la carte, jamais positionné à Rouen", async ({ page }) => {
    await page.goto("/dashboard/tournees");
    await page.waitForTimeout(600);
    await page.getByRole("button", { name: "Carte clients" }).click();

    const listRow = page.getByText(uniqueAnimalName);
    await expect(listRow).toBeVisible();
    const row = listRow.locator("xpath=ancestor::button[1]");
    await expect(row.getByText("Position inconnue")).toBeVisible();

    await expect(page.locator(`[title*="${uniqueAnimalName}"]`)).toHaveCount(0);
  });
});
