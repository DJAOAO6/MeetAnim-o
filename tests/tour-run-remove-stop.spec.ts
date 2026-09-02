import { randomBytes } from "node:crypto";
import { config } from "dotenv";
import { expect, test, type Page } from "@playwright/test";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.local" });

/**
 * Unification des tournées, phase 3 ter (2/2) : "retirer un arrêt" (garde
 * le rendez-vous) et "annuler le rendez-vous" (le supprime) sont deux
 * gestes distincts, jamais fusionnés — et chacun porte un "annuler" qui
 * restaure l'état précédent. Un arrêt manuel (sans rendez-vous) se retire
 * directement, sans ce choix. Date de test fixe et éloignée (2027) pour ne
 * jamais entrer en collision avec une vraie tournée créée par la
 * praticienne pendant que ce test tourne.
 */

const testEmail = "praticien-test@pf-osteo-animale.fr";
const testPassword = "Praticien-Test-2026!";
const testDateId = "2027-03-25"; // jeudi, sans lien avec une vraie tournée
const testOwnerLastName = "E2ERemoveStopTest";

function fakeCuid(): string {
  return `c${randomBytes(12).toString("hex")}`;
}

async function seedTourRunWithStops(): Promise<{ tourRunId: string; appointmentId: string; manualStopId: string }> {
  const sql = neon(process.env.DATABASE_URL!);
  const clientId = fakeCuid();
  const appointmentId = fakeCuid();
  const tourRunId = fakeCuid();
  const stopId = fakeCuid();
  const manualStopId = fakeCuid();
  await sql`INSERT INTO "Client" (id, "firstName", "lastName", phone, email, city, address, "updatedAt") VALUES (${clientId}, 'Prénom', ${testOwnerLastName}, '0611223344', 'e2e-removestop@example.fr', 'Rouen', '12 rue de Test', now())`;
  await sql`
    INSERT INTO "Appointment" (id, "clientId", "clientName", "animalName", "animalSpecies", "serviceName", date, start, duration, mode, location, "postalCode", city, latitude, longitude, price, status, notes, "createdAt", "updatedAt")
    VALUES (${appointmentId}, ${clientId}, ${"Client " + testOwnerLastName}, 'RexRemoveStop', 'Chien', 'Ostéopathie canine', ${testDateId}::date, '10:00', 30, 'DOMICILE', '12 rue de Test', '76000', 'Rouen', 49.4432, 1.0999, 60, 'CONFIRMED', '', now(), now())
  `;
  await sql`
    INSERT INTO "TourRun" (id, "userId", date, name, "departureTime", "startType", "startAddress", "startLatitude", "startLongitude", "endType", "endAddress", "endLatitude", "endLongitude", "createdAt", "updatedAt")
    SELECT ${tourRunId}, u.id, ${testDateId}::date, ${"Tournée " + testOwnerLastName}, '09:00', 'CABINET', 'Cabinet', 49.44, 1.09, 'CABINET', 'Cabinet', 49.44, 1.09, now(), now()
    FROM "User" u WHERE u.email = ${testEmail}
  `;
  await sql`INSERT INTO "TourStop" (id, "tourRunId", "appointmentId", "order", type, label, address, latitude, longitude, "createdAt", "updatedAt") VALUES (${stopId}, ${tourRunId}, ${appointmentId}, 0, 'APPOINTMENT', 'RexRemoveStop', '12 rue de Test, Rouen', 49.4432, 1.0999, now(), now())`;
  await sql`INSERT INTO "TourStop" (id, "tourRunId", "order", type, label, address, latitude, longitude, "createdAt", "updatedAt") VALUES (${manualStopId}, ${tourRunId}, 1, 'OTHER', 'Pause déjeuner E2E', 'Quelque part', 49.45, 1.10, now(), now())`;
  return { tourRunId, appointmentId, manualStopId };
}

async function cleanup() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`DELETE FROM "TourRun" WHERE date = ${testDateId}::date AND name LIKE ${"%" + testOwnerLastName + "%"}`;
  await sql`DELETE FROM "Appointment" WHERE "clientName" LIKE ${"%" + testOwnerLastName}`;
  await sql`DELETE FROM "Client" WHERE "lastName" = ${testOwnerLastName}`;
}

async function clearLoginRateLimit() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`DELETE FROM "RateLimitEvent" WHERE key LIKE 'login:%'`;
}

async function login(page: Page) {
  await page.goto("/login");
  await page.fill('input[type="email"]', testEmail);
  await page.fill('input[type="password"]', testPassword);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard**", { timeout: 10000 });
}

test.describe("Écran de journée — retirer un arrêt vs annuler le rendez-vous", () => {
  test.beforeEach(async () => {
    await clearLoginRateLimit();
    await cleanup();
  });

  test.afterEach(async () => {
    await cleanup();
  });

  test("annuler le rendez-vous depuis un arrêt le change en base, puis « annuler » (undo) le restaure", async ({ page }) => {
    const { appointmentId } = await seedTourRunWithStops();
    await login(page);

    await page.goto(`/dashboard/tournees?date=${testDateId}`);
    await expect(page.getByText(`Tournée ${testOwnerLastName}`)).toBeVisible({ timeout: 10000 });

    await page.getByRole("button", { name: /Retirer RexRemoveStop/ }).click();
    await expect(page.getByText(/Que faire de/)).toBeVisible({ timeout: 5000 });
    await page.getByRole("button", { name: "Annuler le rendez-vous" }).click();

    await expect(page.getByText(/Rendez-vous de.*annulé/)).toBeVisible({ timeout: 10000 });

    const sql = neon(process.env.DATABASE_URL!);
    const cancelled = await sql`SELECT status FROM "Appointment" WHERE id = ${appointmentId}`;
    expect(cancelled[0].status).toBe("CANCELLED");
    const stopsAfterCancel = await sql`SELECT id FROM "TourStop" WHERE "appointmentId" = ${appointmentId}`;
    expect(stopsAfterCancel).toHaveLength(0);

    // Undo : restaure le rendez-vous et le rattache à la journée.
    await page.getByRole("button", { name: "Annuler", exact: true }).click();
    await expect(page.getByText(/Rendez-vous restauré/)).toBeVisible({ timeout: 10000 });

    const restored = await sql`SELECT status FROM "Appointment" WHERE id = ${appointmentId}`;
    expect(restored[0].status).toBe("CONFIRMED");
    const stopsAfterUndo = await sql`SELECT id FROM "TourStop" WHERE "appointmentId" = ${appointmentId}`;
    expect(stopsAfterUndo).toHaveLength(1);
  });

  test("retirer un arrêt-rendez-vous garde le rendez-vous confirmé, et « annuler » (undo) le rattache de nouveau", async ({ page }) => {
    const { appointmentId } = await seedTourRunWithStops();
    await login(page);

    await page.goto(`/dashboard/tournees?date=${testDateId}`);
    await expect(page.getByText(`Tournée ${testOwnerLastName}`)).toBeVisible({ timeout: 10000 });

    await page.getByRole("button", { name: /Retirer RexRemoveStop/ }).click();
    await expect(page.getByText(/Que faire de/)).toBeVisible({ timeout: 5000 });
    await page.getByRole("button", { name: "Retirer de la tournée (garder le rendez-vous)" }).click();

    await expect(page.getByText(/retiré de la tournée/)).toBeVisible({ timeout: 10000 });

    const sql = neon(process.env.DATABASE_URL!);
    const kept = await sql`SELECT status FROM "Appointment" WHERE id = ${appointmentId}`;
    expect(kept[0].status).toBe("CONFIRMED");
    const stopsAfterRemove = await sql`SELECT id FROM "TourStop" WHERE "appointmentId" = ${appointmentId}`;
    expect(stopsAfterRemove).toHaveLength(0);

    await page.getByRole("button", { name: "Annuler", exact: true }).click();
    await expect(page.getByText(/Arrêt restauré/)).toBeVisible({ timeout: 10000 });

    const stopsAfterUndo = await sql`SELECT id FROM "TourStop" WHERE "appointmentId" = ${appointmentId}`;
    expect(stopsAfterUndo).toHaveLength(1);
  });

  test("retirer un arrêt manuel se fait directement, sans le choix retirer/annuler", async ({ page }) => {
    const { manualStopId } = await seedTourRunWithStops();
    await login(page);

    await page.goto(`/dashboard/tournees?date=${testDateId}`);
    await expect(page.getByText(`Tournée ${testOwnerLastName}`)).toBeVisible({ timeout: 10000 });

    await page.getByRole("button", { name: /Retirer.*Pause déjeuner E2E/ }).click();
    await expect(page.getByText(/Que faire de/)).toHaveCount(0);
    await expect(page.getByText(/retiré de la tournée/)).toBeVisible({ timeout: 10000 });

    const sql = neon(process.env.DATABASE_URL!);
    const rows = await sql`SELECT id FROM "TourStop" WHERE id = ${manualStopId}`;
    expect(rows).toHaveLength(0);
  });
});
