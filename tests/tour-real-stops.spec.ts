import { config } from "dotenv";
import { expect, test } from "@playwright/test";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.local" });

/**
 * FIX_PLAN.md P2-25 : les arrêts d'une tournée (TourAppointment) et son
 * nombre de rendez-vous n'avaient aucun chemin d'écriture réel — seul le
 * seed pouvait les peupler, jamais mis à jour ensuite. Vérifie que les
 * arrêts et le total affichés viennent désormais d'un vrai rendez-vous à
 * domicile correspondant à la zone et au jour de la tournée.
 */

const testEmail = "praticien-test@pf-osteo-animale.fr";
const testPassword = "Praticien-Test-2026!";
const testZoneId = "tmp-tour-p25-zone";
const testTourId = "tmp-tour-p25";
const testClientId = "tmp-tour-p25-client";
const testAnimalId = "tmp-tour-p25-animal";
const testAppointmentId = "tmp-tour-p25-appt";
const weekdayLabels = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];

function todayDateId(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Sa propre zone plutôt qu'une dépendance à "Zone Rouen Nord" du seed de
 * base : cette base de dev n'a pas toujours de zones pré-existantes
 * (environnement fraîchement provisionné), le test doit rester autonome.
 */
async function seedTourAndAppointment() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`INSERT INTO "Zone" (id, name) VALUES (${testZoneId}, 'Zone E2E P25')`;
  await sql`INSERT INTO "City" (id, name, "postalCode", "zoneId") VALUES ('tmp-tour-p25-city', 'Rouen', '76000', ${testZoneId})`;

  const today = new Date();
  const todayLabel = weekdayLabels[today.getDay()];

  await sql`
    INSERT INTO "Tour" (id, name, recurrence, day, "dateLabel", "startTime", "endTime", "zoneId", status)
    VALUES (${testTourId}, 'Tournée E2E P25', 'Toutes les semaines', ${todayLabel}, 'test', '08:00', '20:00', ${testZoneId}, 'ACTIVE')
  `;
  await sql`INSERT INTO "Client" (id, "firstName", "lastName", phone, email, city, address, "updatedAt") VALUES (${testClientId}, 'Prénom', 'E2ETourP25Test', '0600000000', 'tour-p25-e2e@example.fr', 'Rouen', '1 rue Test', now())`;
  await sql`INSERT INTO "Animal" (id, "clientId", name, species, breed, age, weight, sex, avatar, "avatarBackground", history, conditions, treatments, notes, "updatedAt") VALUES (${testAnimalId}, ${testClientId}, 'TourP25Test', 'Chien', '', '', '', '', '', '', '', '', '', '', now())`;
  await sql`
    INSERT INTO "Appointment" (id, "clientId", "animalId", "clientName", "animalName", "serviceName", date, start, duration, mode, location, "postalCode", city, latitude, longitude, price, status, notes, "createdAt", "updatedAt")
    VALUES (${testAppointmentId}, ${testClientId}, ${testAnimalId}, 'Prénom E2ETourP25Test', 'TourP25Test', 'Ostéopathie E2E Tour', ${todayDateId()}::date, '10:00', 60, 'DOMICILE', 'Rouen', '76000', 'Rouen', 49.4432, 1.0999, 80, 'CONFIRMED', '', now(), now())
  `;
}

async function cleanupData() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`DELETE FROM "Appointment" WHERE id = ${testAppointmentId}`;
  await sql`DELETE FROM "Client" WHERE "lastName" = 'E2ETourP25Test'`;
  await sql`DELETE FROM "Tour" WHERE id = ${testTourId}`;
  await sql`DELETE FROM "City" WHERE "zoneId" = ${testZoneId}`;
  await sql`DELETE FROM "Zone" WHERE id = ${testZoneId}`;
}

async function clearLoginRateLimit() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`DELETE FROM "RateLimitEvent" WHERE key LIKE 'login:%'`;
}

test.describe("Tournées — arrêts réels (P2-25)", () => {
  test.beforeEach(async ({ page }) => {
    await cleanupData();
    await seedTourAndAppointment();
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

  test("le nombre de rendez-vous et les arrêts viennent d'un vrai rendez-vous à domicile, pas d'une table jamais alimentée", async ({ page }) => {
    await page.goto("/dashboard/tournees");
    const heading = page.getByText("Tournée E2E P25", { exact: true });
    await heading.scrollIntoViewIfNeeded();
    const card = heading.locator("xpath=ancestor::*[contains(@class,'rounded-')][1]");
    await expect(card.getByText("1", { exact: true })).toBeVisible();

    await card.getByRole("button", { name: "Voir la journée" }).click();
    await expect(page.getByText("TourP25Test", { exact: true })).toBeVisible();
    await expect(page.getByText("Ostéopathie E2E Tour")).toBeVisible();
    await expect(page.getByText("Prénom E2ETourP25Test", { exact: true })).toBeVisible();
  });
});
