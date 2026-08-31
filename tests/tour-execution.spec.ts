import { config } from "dotenv";
import { expect, test } from "@playwright/test";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.local" });

/**
 * Refonte tournées, phase 2a : l'écran d'exécution remplace le détail
 * purement descriptif. Vérifie que "Terminé" appelle la même action que
 * l'agenda (statut COMPLETED + completedAt + vraie ligne Consultation) et
 * fait avancer le compteur, l'arrêt suivant devenant "en cours".
 */

const testEmail = "praticien-test@pf-osteo-animale.fr";
const testPassword = "Praticien-Test-2026!";

const testZoneId = "tmp-p2a-zone";
const testTourId = "tmp-p2a-tour";
const clientAId = "tmp-p2a-client-a";
const clientBId = "tmp-p2a-client-b";
const animalAId = "tmp-p2a-animal-a";
const animalBId = "tmp-p2a-animal-b";
const appointmentAId = "tmp-p2a-appt-a";
const appointmentBId = "tmp-p2a-appt-b";
const animalAName = "P2aStopAnimalA";
const animalBName = "P2aStopAnimalB";
const weekdayLabels = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];

function todayDateId(): string {
  return new Date().toISOString().slice(0, 10);
}

async function grantPermission() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`UPDATE "User" SET permissions = ARRAY['MANAGE_PUBLIC_SETTINGS'] WHERE email = ${testEmail}`;
}

async function revokePermission() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`UPDATE "User" SET permissions = ARRAY[]::text[] WHERE email = ${testEmail}`;
}

async function seed() {
  const sql = neon(process.env.DATABASE_URL!);
  const todayLabel = weekdayLabels[new Date().getDay()];

  await sql`INSERT INTO "Zone" (id, name) VALUES (${testZoneId}, 'Zone E2E Exécution P2a')`;
  await sql`INSERT INTO "City" (id, name, "postalCode", "zoneId") VALUES ('tmp-p2a-city', 'VilleTestP2a', '76200', ${testZoneId})`;
  await sql`
    INSERT INTO "Tour" (id, name, recurrence, day, "dateLabel", "startTime", "endTime", "zoneId", status)
    VALUES (${testTourId}, 'Tournée E2E Exécution P2a', 'Toutes les semaines', ${todayLabel}, 'test', '08:00', '20:00', ${testZoneId}, 'ACTIVE')
  `;

  await sql`INSERT INTO "Client" (id, "firstName", "lastName", phone, email, city, address, "updatedAt") VALUES (${clientAId}, 'Prénom', 'E2EExecP2aA', '06 12 34 56 78', 'p2a-exec-a@example.fr', 'VilleTestP2a', '1 rue Test', now())`;
  await sql`INSERT INTO "Client" (id, "firstName", "lastName", phone, email, city, address, "updatedAt") VALUES (${clientBId}, 'Prénom', 'E2EExecP2aB', '06 98 76 54 32', 'p2a-exec-b@example.fr', 'VilleTestP2a', '2 rue Test', now())`;
  await sql`INSERT INTO "Animal" (id, "clientId", name, species, breed, age, weight, sex, avatar, "avatarBackground", history, conditions, treatments, notes, "updatedAt") VALUES (${animalAId}, ${clientAId}, ${animalAName}, 'Chien', '', '', '', '', '', '', '', '', '', '', now())`;
  await sql`INSERT INTO "Animal" (id, "clientId", name, species, breed, age, weight, sex, avatar, "avatarBackground", history, conditions, treatments, notes, "updatedAt") VALUES (${animalBId}, ${clientBId}, ${animalBName}, 'Chat', '', '', '', '', '', '', '', '', '', '', now())`;

  await sql`
    INSERT INTO "Appointment" (id, "clientId", "animalId", "clientName", "animalName", "serviceName", date, start, duration, mode, location, "postalCode", city, latitude, longitude, price, status, notes, "createdAt", "updatedAt")
    VALUES (${appointmentAId}, ${clientAId}, ${animalAId}, 'Prénom E2EExecP2aA', ${animalAName}, 'Ostéopathie E2E P2a', ${todayDateId()}::date, '09:00', 30, 'DOMICILE', '1 rue Test', '76200', 'VilleTestP2a', 49.9219, 1.0771, 60, 'CONFIRMED', '', now(), now())
  `;
  await sql`
    INSERT INTO "Appointment" (id, "clientId", "animalId", "clientName", "animalName", "serviceName", date, start, duration, mode, location, "postalCode", city, latitude, longitude, price, status, notes, "createdAt", "updatedAt")
    VALUES (${appointmentBId}, ${clientBId}, ${animalBId}, 'Prénom E2EExecP2aB', ${animalBName}, 'Ostéopathie E2E P2a', ${todayDateId()}::date, '11:00', 30, 'DOMICILE', '2 rue Test', '76200', 'VilleTestP2a', 49.9219, 1.0771, 60, 'CONFIRMED', '', now(), now())
  `;
}

async function cleanup() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`DELETE FROM "Consultation" WHERE "animalId" IN (${animalAId}, ${animalBId})`;
  await sql`DELETE FROM "Appointment" WHERE id IN (${appointmentAId}, ${appointmentBId})`;
  await sql`DELETE FROM "Animal" WHERE id IN (${animalAId}, ${animalBId})`;
  await sql`DELETE FROM "Client" WHERE id IN (${clientAId}, ${clientBId})`;
  await sql`DELETE FROM "Tour" WHERE id = ${testTourId}`;
  await sql`DELETE FROM "City" WHERE "zoneId" = ${testZoneId}`;
  await sql`DELETE FROM "Zone" WHERE id = ${testZoneId}`;
}

test.describe("Mode tournée — clôture d'un arrêt (Phase 2a)", () => {
  test.beforeAll(async () => {
    await grantPermission();
  });

  test.afterAll(async () => {
    await cleanup();
    await revokePermission();
  });

  test.beforeEach(async ({ page }) => {
    await cleanup();
    await seed();
    await page.goto("/login");
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', testPassword);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard**", { timeout: 10000 });
    await page.goto("/dashboard/tournees");
    await page.waitForTimeout(600);
    const heading = page.getByText("Tournée E2E Exécution P2a", { exact: true });
    await heading.scrollIntoViewIfNeeded();
    const card = heading.locator("xpath=ancestor::*[contains(@class,'rounded-')][1]");
    await card.getByRole("button", { name: "Voir la journée" }).click();
    await expect(page.getByText(animalAName, { exact: true })).toBeVisible();
  });

  test("marquer l'arrêt en cours comme Terminé avance le compteur, crée une vraie Consultation et fait passer au suivant", async ({ page }) => {
    await expect(page.getByText("0/2 arrêts")).toBeVisible();

    const currentCard = page.locator("text=Arrêt en cours").locator("xpath=following-sibling::*[1]");
    await expect(currentCard.getByText(animalAName)).toBeVisible();

    await currentCard.getByRole("button", { name: "Terminé" }).click();
    await expect(page.getByText(`${animalAName} — consultation marquée comme réalisée.`)).toBeVisible();

    await expect(page.getByText("1/2 arrêts")).toBeVisible();
    const nextCurrentCard = page.locator("text=Arrêt en cours").locator("xpath=following-sibling::*[1]");
    await expect(nextCurrentCard.getByText(animalBName)).toBeVisible();

    await expect(page.getByText("1 arrêt terminé")).toBeVisible();
    await page.getByRole("button", { name: /arrêt terminé/ }).click();
    await expect(page.getByText(/Terminé à \d{2}:\d{2}/)).toBeVisible();

    const sql = neon(process.env.DATABASE_URL!);
    const [appointmentRow] = await sql`SELECT status, "completedAt" FROM "Appointment" WHERE id = ${appointmentAId}`;
    expect(appointmentRow.status).toBe("COMPLETED");
    expect(appointmentRow.completedAt).not.toBeNull();

    const consultationRows = await sql`SELECT id, service FROM "Consultation" WHERE "animalId" = ${animalAId}`;
    expect(consultationRows).toHaveLength(1);
    expect(consultationRows[0].service).toBe("Ostéopathie E2E P2a");
  });
});
