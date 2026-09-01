import { randomBytes } from "node:crypto";
import { config } from "dotenv";
import { expect, test, type Page } from "@playwright/test";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.local" });

/**
 * Refonte tournées — étape 3 : timeline des arrêts + recherche client/animal.
 */

const testEmail = "praticien-test@pf-osteo-animale.fr";
const testPassword = "Praticien-Test-2026!";
const tourName = "Tournée E2E Timeline";
const zoneName = "Zone E2E Timeline";
const animalName = "RexTimelineE2E";
const clientLastName = "E2ETimelineClient";

function fakeCuid(): string {
  return `c${randomBytes(12).toString("hex")}`;
}

async function grantPermission() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`UPDATE "User" SET permissions = ARRAY['MANAGE_PUBLIC_SETTINGS'] WHERE email = ${testEmail}`;
}

async function cleanup() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`DELETE FROM "Appointment" WHERE "clientName" LIKE ${"%" + clientLastName}`;
  await sql`DELETE FROM "Tour" WHERE name LIKE ${tourName + "%"}`;
  await sql`DELETE FROM "Zone" WHERE name = ${zoneName}`;
  await sql`DELETE FROM "Client" WHERE "lastName" = ${clientLastName}`;
}

async function seedClientAndAnimal(): Promise<{ clientId: string; animalId: string }> {
  const sql = neon(process.env.DATABASE_URL!);
  const clientId = fakeCuid();
  const animalId = fakeCuid();
  await sql`INSERT INTO "Client" (id, "firstName", "lastName", phone, email, city, address, "updatedAt") VALUES (${clientId}, 'Prénom', ${clientLastName}, '0600000000', 'timeline-e2e@example.fr', 'Rouen', '1 rue de Test', now())`;
  await sql`INSERT INTO "Animal" (id, "clientId", name, species, breed, age, weight, sex, avatar, "avatarBackground", history, conditions, treatments, notes, "updatedAt") VALUES (${animalId}, ${clientId}, ${animalName}, 'Chien', '', '', '', '', '', '', '', '', '', '', now())`;
  return { clientId, animalId };
}

async function login(page: Page) {
  await page.goto("/login");
  await page.fill('input[type="email"]', testEmail);
  await page.fill('input[type="password"]', testPassword);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard**", { timeout: 10000 });
}

test.describe("Tournées — timeline des arrêts", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(grantPermission);
  test.beforeEach(async ({ page }) => {
    const sql = neon(process.env.DATABASE_URL!);
    await sql`DELETE FROM "RateLimitEvent" WHERE key LIKE 'login:%'`;
    await cleanup();
    await login(page);
  });
  test.afterAll(cleanup);

  test("rechercher un animal par son nom et l'ajouter comme arrêt le fait apparaître dans la timeline", async ({ page }) => {
    await seedClientAndAnimal();

    await page.goto("/dashboard/tournees");
    await page.getByRole("button", { name: /^Zones/ }).click();
    const zonesPanel = page.locator('[role="dialog"][aria-labelledby="zones-panel-title"]');
    await expect(zonesPanel).toBeVisible({ timeout: 10000 });
    await zonesPanel.getByRole("button", { name: "+ Nouvelle zone" }).click();
    const zoneDialog = page.locator('[role="dialog"]').filter({ hasText: "Créer une zone" });
    await zoneDialog.getByPlaceholder("Ex. Zone Le Havre").fill(zoneName);
    await zoneDialog.getByPlaceholder("Ville").fill("Rouen");
    await zoneDialog.getByPlaceholder("Code postal").fill("76000");
    await zoneDialog.getByRole("button", { name: "Créer la zone" }).click();
    await expect(zoneDialog).toHaveCount(0, { timeout: 10000 });
    await zonesPanel.getByRole("button", { name: "Fermer" }).click();
    await expect(zonesPanel).toHaveCount(0, { timeout: 10000 });

    await page.getByRole("button", { name: "+ Nouvelle tournée", exact: true }).click();
    const tourDialog = page.locator('[role="dialog"]').first();
    await tourDialog.locator('input[placeholder="Ex. Secteur Dieppe"]').fill(tourName);
    await tourDialog.getByRole("button", { name: zoneName, exact: true }).click();
    await tourDialog.getByRole("button", { name: "Créer la tournée" }).click();
    await expect(tourDialog).toHaveCount(0, { timeout: 10000 });

    await page.getByRole("button", { name: new RegExp(tourName) }).click();
    await expect(page.getByRole("heading", { name: tourName })).toBeVisible({ timeout: 10000 });

    await page.getByRole("button", { name: "+ Ajouter un arrêt" }).click();
    await page.getByPlaceholder("Rechercher un animal (nom)").fill(animalName);
    await expect(page.getByRole("button", { name: new RegExp(animalName) })).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: new RegExp(animalName) }).click();

    await expect(page.getByRole("button", { name: "Ajouter à la tournée" })).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: "Ajouter à la tournée" }).click();

    await expect(page.getByText(new RegExp(animalName))).toBeVisible({ timeout: 15000 });
  });
});
