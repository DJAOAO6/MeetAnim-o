import { config } from "dotenv";
import { expect, test } from "@playwright/test";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.local" });

/**
 * FIX_PLAN.md P2-24 : /dashboard/statistiques était 100 % données fictives
 * (facteurs multiplicatifs sur des constantes), derrière une vraie
 * permission (VIEW_FINANCES) qui laissait croire à des chiffres fiables.
 * Vérifie que le CA affiché correspond à un vrai rendez-vous inséré en
 * base, et qu'un changement de filtre déclenche une vraie relecture.
 */

const testEmail = "praticien-test@pf-osteo-animale.fr";
const testPassword = "Praticien-Test-2026!";
const testClientId = "tmp-stats-client";
const testAnimalId = "tmp-stats-animal";
const testAppointmentId = "tmp-stats-appointment";
const testClientLastName = "E2EStatsTest";
const knownPrice = 137;
// Date fixe dans le passé (statut CONFIRMED + date passée = "réellement
// tenu", cf. stats.ts — aucune action de l'app ne pose jamais COMPLETED).
const appointmentDateId = "2026-08-01";

async function grantViewFinances() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`UPDATE "User" SET permissions = ARRAY['VIEW_FINANCES'] WHERE email = ${testEmail}`;
}

async function revokeViewFinances() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`UPDATE "User" SET permissions = ARRAY[]::text[] WHERE email = ${testEmail}`;
}

async function seedData() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`INSERT INTO "Client" (id, "firstName", "lastName", phone, email, city, address, "updatedAt") VALUES (${testClientId}, 'Prénom', ${testClientLastName}, '0600000000', 'stats-e2e@example.fr', 'Rouen', '1 rue Test', now())`;
  await sql`INSERT INTO "Animal" (id, "clientId", name, species, breed, age, weight, sex, avatar, "avatarBackground", history, conditions, treatments, notes, "updatedAt") VALUES (${testAnimalId}, ${testClientId}, 'StatsE2E', 'Chien', '', '', '', '', '', '', '', '', '', '', now())`;
  await sql`
    INSERT INTO "Appointment" (id, "clientId", "animalId", "clientName", "animalName", "serviceName", date, start, duration, mode, location, price, status, notes, "createdAt", "updatedAt")
    VALUES (${testAppointmentId}, ${testClientId}, ${testAnimalId}, 'Prénom E2EStatsTest', 'StatsE2E', 'Ostéopathie E2E Test', ${appointmentDateId}::date, '10:00', 60, 'CABINET', 'Cabinet', ${knownPrice}, 'CONFIRMED', '', now(), now())
  `;
}

async function cleanupData() {
  const sql = neon(process.env.DATABASE_URL!);
  // Appointment.clientId est onDelete: SetNull (pas Cascade) : supprimer le
  // client laisserait le rendez-vous orphelin avec le même id fixe, faisant
  // échouer l'INSERT du run suivant sur la contrainte de clé primaire.
  await sql`DELETE FROM "Appointment" WHERE id = ${testAppointmentId}`;
  await sql`DELETE FROM "Client" WHERE "lastName" = ${testClientLastName}`;
}

async function clearLoginRateLimit() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`DELETE FROM "RateLimitEvent" WHERE key LIKE 'login:%'`;
}

test.describe("Statistiques (réel, non simulé)", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async ({ page }) => {
    await cleanupData();
    await seedData();
    await grantViewFinances();
    await clearLoginRateLimit();
    await page.goto("/login");
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', testPassword);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard**", { timeout: 10000 });
  });

  test.afterEach(async () => {
    await cleanupData();
    await revokeViewFinances();
  });

  test("le CA affiché correspond à un vrai rendez-vous, pour la période exacte qui le contient", async ({ page }) => {
    await page.goto("/dashboard/statistiques");
    await page.getByLabel("Période").selectOption("custom");
    await page.getByLabel("Du", { exact: true }).fill(appointmentDateId);
    await page.getByLabel("Au", { exact: true }).fill(appointmentDateId);
    await page.waitForTimeout(1000);

    await expect(page.getByText(`${knownPrice} €`).first()).toBeVisible();
    await expect(page.getByText("Ostéopathie E2E Test")).toBeVisible();
  });

  test("changer la période vers une plage qui ne contient pas le rendez-vous fait retomber le CA à 0", async ({ page }) => {
    await page.goto("/dashboard/statistiques");
    await page.getByLabel("Période").selectOption("custom");
    await page.getByLabel("Du", { exact: true }).fill("2020-01-01");
    await page.getByLabel("Au", { exact: true }).fill("2020-01-31");
    await page.waitForTimeout(1000);

    await expect(page.getByText("0 €").first()).toBeVisible();
  });
});
