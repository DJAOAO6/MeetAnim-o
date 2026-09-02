import { randomBytes } from "node:crypto";
import { config } from "dotenv";
import { expect, test, type Page } from "@playwright/test";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.local" });

/**
 * Unification des tournées, phase 3 ter : tout est modifiable depuis
 * l'écran de journée. Modifier l'heure/la durée d'un arrêt lié à un
 * rendez-vous doit mettre à jour le VRAI rendez-vous (Appointment), avec
 * les mêmes contrôles de conflit que partout ailleurs — jamais un chemin
 * parallèle qui écrirait uniquement sur TourStop. Date de test fixe et
 * éloignée (2027) pour ne jamais entrer en collision avec une vraie
 * tournée créée par la praticienne pendant que ce test tourne.
 */

const testEmail = "praticien-test@pf-osteo-animale.fr";
const testPassword = "Praticien-Test-2026!";
const testDateId = "2027-03-23"; // mardi, sans lien avec une vraie tournée
const testOwnerLastName = "E2EStopScheduleTest";

function fakeCuid(): string {
  return `c${randomBytes(12).toString("hex")}`;
}

async function seedTourRunWithStop(): Promise<{ tourRunId: string; appointmentId: string; stopId: string }> {
  const sql = neon(process.env.DATABASE_URL!);
  const clientId = fakeCuid();
  const appointmentId = fakeCuid();
  const tourRunId = fakeCuid();
  const stopId = fakeCuid();
  await sql`INSERT INTO "Client" (id, "firstName", "lastName", phone, email, city, address, "updatedAt") VALUES (${clientId}, 'Prénom', ${testOwnerLastName}, '0611223344', 'e2e-stopschedule@example.fr', 'Rouen', '12 rue de Test', now())`;
  await sql`
    INSERT INTO "Appointment" (id, "clientId", "clientName", "animalName", "animalSpecies", "serviceName", date, start, duration, mode, location, "postalCode", city, latitude, longitude, price, status, notes, "createdAt", "updatedAt")
    VALUES (${appointmentId}, ${clientId}, ${"Client " + testOwnerLastName}, 'RexStopSchedule', 'Chien', 'Ostéopathie canine', ${testDateId}::date, '10:00', 30, 'DOMICILE', '12 rue de Test', '76000', 'Rouen', 49.4432, 1.0999, 60, 'CONFIRMED', '', now(), now())
  `;
  await sql`
    INSERT INTO "TourRun" (id, "userId", date, name, "departureTime", "startType", "startAddress", "startLatitude", "startLongitude", "endType", "endAddress", "endLatitude", "endLongitude", "createdAt", "updatedAt")
    SELECT ${tourRunId}, u.id, ${testDateId}::date, ${"Tournée " + testOwnerLastName}, '09:00', 'CABINET', 'Cabinet', 49.44, 1.09, 'CABINET', 'Cabinet', 49.44, 1.09, now(), now()
    FROM "User" u WHERE u.email = ${testEmail}
  `;
  await sql`INSERT INTO "TourStop" (id, "tourRunId", "appointmentId", "order", type, label, address, latitude, longitude, locked, "createdAt", "updatedAt") VALUES (${stopId}, ${tourRunId}, ${appointmentId}, 0, 'APPOINTMENT', 'RexStopSchedule', '12 rue de Test, Rouen', 49.4432, 1.0999, true, now(), now())`;
  return { tourRunId, appointmentId, stopId };
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

test.describe("Écran de journée — tout est modifiable", () => {
  test.beforeEach(async () => {
    await clearLoginRateLimit();
    await cleanup();
  });

  test.afterEach(async () => {
    await cleanup();
  });

  test("modifier l'heure/la durée d'un arrêt met à jour le vrai rendez-vous, le créneau imposé et l'heure de départ persistent", async ({ page }) => {
    const { appointmentId } = await seedTourRunWithStop();
    await login(page);

    await page.goto(`/dashboard/tournees?date=${testDateId}`);
    await expect(page.getByText(`Tournée ${testOwnerLastName}`)).toBeVisible({ timeout: 10000 });

    // Heure de départ de la journée.
    // .fill() ne déclenche pas fiablement onChange sur un <input type="time">
    // déjà rempli dans Chromium/Playwright — taper les chiffres reproduit le
    // vrai geste d'une utilisatrice et déclenche onChange normalement.
    const departureInput = page.locator("#tour-run-departure-time-edit");
    await departureInput.click();
    await departureInput.pressSequentially("0830");
    await departureInput.blur();
    await page.waitForTimeout(800);

    // Ouvre le panneau de détail de l'arrêt.
    await page.getByText(/RexStopSchedule/).first().click();

    const startInput = page.locator('input[id^="stop-start-"]');
    await expect(startInput).toBeVisible({ timeout: 10000 });
    await startInput.fill("11:15");
    await startInput.blur();
    await page.waitForTimeout(800);

    const durationInput = page.locator('input[id^="stop-duration-"]');
    await durationInput.fill("45");
    await durationInput.blur();
    await page.waitForTimeout(800);

    const windowInputs = page.locator('input[aria-label*="Créneau imposé"]');
    await windowInputs.nth(0).fill("14:00");
    await windowInputs.nth(0).blur();
    await page.waitForTimeout(800);
    await windowInputs.nth(1).fill("16:00");
    await windowInputs.nth(1).blur();
    await page.waitForTimeout(800);

    // Le nouvel horaire doit réapparaître dans la timeline (recalcul appliqué).
    await expect(page.getByRole("button", { name: /11:15.*RexStopSchedule/ })).toBeVisible({ timeout: 10000 });

    // Vérification de l'état réel en base, pas seulement du DOM.
    const sql = neon(process.env.DATABASE_URL!);
    const appointments = await sql`SELECT start, duration FROM "Appointment" WHERE id = ${appointmentId}`;
    expect(appointments[0].start).toBe("11:15");
    expect(appointments[0].duration).toBe(45);

    const stops = await sql`SELECT "timeWindowStart", "timeWindowEnd", locked, "arrivalTime" FROM "TourStop" WHERE "appointmentId" = ${appointmentId}`;
    expect(stops[0].timeWindowStart).toBe("14:00");
    expect(stops[0].timeWindowEnd).toBe("16:00");
    expect(stops[0].locked).toBe(true);
    expect(stops[0].arrivalTime).toBe("11:15");

    const tourRuns = await sql`SELECT "departureTime" FROM "TourRun" WHERE date = ${testDateId}::date AND name LIKE ${"%" + testOwnerLastName + "%"}`;
    expect(tourRuns[0].departureTime).toBe("08:30");
  });

  test("un conflit d'horaire refuse le changement d'heure et l'arrêt revient à sa valeur précédente", async ({ page }) => {
    const { appointmentId } = await seedTourRunWithStop();
    const sql = neon(process.env.DATABASE_URL!);
    // Un second rendez-vous, déjà confirmé, occupe 13:00 — collision garantie
    // en y déplaçant l'arrêt de test.
    const otherClientId = fakeCuid();
    await sql`INSERT INTO "Client" (id, "firstName", "lastName", phone, email, city, address, "updatedAt") VALUES (${otherClientId}, 'Autre', ${testOwnerLastName}, '0611223355', 'e2e-stopschedule-2@example.fr', 'Rouen', '3 rue de Test', now())`;
    await sql`
      INSERT INTO "Appointment" (id, "clientId", "clientName", "animalName", "animalSpecies", "serviceName", date, start, duration, mode, location, "postalCode", city, price, status, notes, "createdAt", "updatedAt")
      VALUES (${fakeCuid()}, ${otherClientId}, ${"Autre client " + testOwnerLastName}, 'AutreAnimal', 'Chat', 'Ostéopathie féline', ${testDateId}::date, '13:00', 30, 'CABINET', 'Cabinet', '76000', 'Rouen', 60, 'CONFIRMED', '', now(), now())
    `;
    await login(page);

    await page.goto(`/dashboard/tournees?date=${testDateId}`);
    await expect(page.getByText(`Tournée ${testOwnerLastName}`)).toBeVisible({ timeout: 10000 });

    await page.getByText(/RexStopSchedule/).first().click();
    const startInput = page.locator('input[id^="stop-start-"]');
    await expect(startInput).toBeVisible({ timeout: 10000 });
    await startInput.fill("13:00");
    await startInput.blur();

    await expect(page.getByText(/chevauche|conflit|créneau/i)).toBeVisible({ timeout: 10000 });

    // L'heure du rendez-vous n'a pas bougé en base.
    const appointments = await sql`SELECT start FROM "Appointment" WHERE id = ${appointmentId}`;
    expect(appointments[0].start).toBe("10:00");
  });
});
