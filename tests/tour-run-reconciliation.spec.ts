import { randomBytes } from "node:crypto";
import { config } from "dotenv";
import { expect, test, type Page } from "@playwright/test";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.local" });

/**
 * Audit de conformité, constat n°2 : "à placer" (rendez-vous à domicile pas
 * encore un arrêt) et "à retirer" (arrêt dont le rendez-vous a été annulé ou
 * déplacé) étaient calculés côté serveur (tour-runs.ts) mais jamais
 * consommés par l'interface — ce test vérifie qu'ils apparaissent bien à
 * l'écran, avec une action réelle et vérifiée en base pour chacun.
 */

const testEmail = "praticien-test@pf-osteo-animale.fr";
const testPassword = "Praticien-Test-2026!";
const testDateId = "2027-06-08"; // mardi, sans lien avec une vraie tournée
const testOwnerLastName = "E2EReconciliationTest";
const unplacedAnimalName = "RexReconciliationUnplaced";
const cancelledAnimalName = "RexReconciliationCancelled";

function fakeCuid(): string {
  return `c${randomBytes(12).toString("hex")}`;
}

async function seed(): Promise<{ tourRunId: string; unplacedAppointmentId: string; cancelledAppointmentId: string; cancelledStopId: string }> {
  const sql = neon(process.env.DATABASE_URL!);
  const clientId = fakeCuid();
  const tourRunId = fakeCuid();
  const unplacedAppointmentId = fakeCuid();
  const cancelledAppointmentId = fakeCuid();
  const cancelledStopId = fakeCuid();

  await sql`INSERT INTO "Client" (id, "firstName", "lastName", phone, email, city, address, "updatedAt") VALUES (${clientId}, 'Prénom', ${testOwnerLastName}, '0611223344', 'e2e-reconciliation@example.fr', 'Rouen', '12 rue de Test', now())`;

  // Rendez-vous à domicile de cette date, jamais rattaché à la tournée : "à placer".
  await sql`
    INSERT INTO "Appointment" (id, "clientId", "clientName", "animalName", "animalSpecies", "serviceName", date, start, duration, mode, location, "postalCode", city, latitude, longitude, price, status, notes, "createdAt", "updatedAt")
    VALUES (${unplacedAppointmentId}, ${clientId}, ${"Client " + testOwnerLastName}, ${unplacedAnimalName}, 'Chien', 'Ostéopathie canine', ${testDateId}::date, '10:00', 30, 'DOMICILE', '12 rue de Test', '76000', 'Rouen', 49.4432, 1.0999, 60, 'CONFIRMED', '', now(), now())
  `;

  // Rendez-vous annulé, dont l'arrêt existe encore dans la tournée : "à retirer".
  await sql`
    INSERT INTO "Appointment" (id, "clientId", "clientName", "animalName", "animalSpecies", "serviceName", date, start, duration, mode, location, "postalCode", city, latitude, longitude, price, status, notes, "createdAt", "updatedAt")
    VALUES (${cancelledAppointmentId}, ${clientId}, ${"Client " + testOwnerLastName}, ${cancelledAnimalName}, 'Chien', 'Ostéopathie canine', ${testDateId}::date, '11:00', 30, 'DOMICILE', '12 rue de Test', '76000', 'Rouen', 49.4432, 1.0999, 60, 'CANCELLED', '', now(), now())
  `;

  await sql`
    INSERT INTO "TourRun" (id, "userId", date, name, "departureTime", "startType", "startAddress", "startLatitude", "startLongitude", "endType", "endAddress", "endLatitude", "endLongitude", "createdAt", "updatedAt")
    SELECT ${tourRunId}, u.id, ${testDateId}::date, ${"Tournée " + testOwnerLastName}, '09:00', 'CABINET', 'Cabinet', 49.44, 1.09, 'CABINET', 'Cabinet', 49.44, 1.09, now(), now()
    FROM "User" u WHERE u.email = ${testEmail}
  `;
  await sql`INSERT INTO "TourStop" (id, "tourRunId", "appointmentId", "order", type, label, address, latitude, longitude, locked, "createdAt", "updatedAt") VALUES (${cancelledStopId}, ${tourRunId}, ${cancelledAppointmentId}, 0, 'APPOINTMENT', ${cancelledAnimalName}, '12 rue de Test, Rouen', 49.4432, 1.0999, true, now(), now())`;

  return { tourRunId, unplacedAppointmentId, cancelledAppointmentId, cancelledStopId };
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

test.describe("Réconciliation avec l'agenda — à placer / à retirer", () => {
  test.beforeEach(async () => {
    await clearLoginRateLimit();
    await cleanup();
  });

  test.afterEach(async () => {
    await cleanup();
  });

  test("un rendez-vous non placé peut être ajouté, un arrêt annulé peut être retiré", async ({ page }) => {
    const { unplacedAppointmentId, cancelledAppointmentId, cancelledStopId } = await seed();
    await login(page);
    await page.goto(`/dashboard/tournees?date=${testDateId}`);

    await expect(page.getByText("1 rendez-vous à placer")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(new RegExp(unplacedAnimalName))).toBeVisible();
    await expect(page.getByText("1 arrêt à retirer")).toBeVisible();
    await expect(page.getByText(/rendez-vous annulé/)).toBeVisible();

    const sql = neon(process.env.DATABASE_URL!);

    // "Ajouter à la tournée" sur le rendez-vous non placé.
    await page.getByRole("button", { name: "Ajouter à la tournée" }).click();
    await expect(page.getByText("1 rendez-vous à placer")).toHaveCount(0, { timeout: 10000 });
    const newStop = await sql`SELECT id FROM "TourStop" WHERE "appointmentId" = ${unplacedAppointmentId}`;
    expect(newStop.length).toBe(1);

    // "Retirer" sur l'arrêt annulé.
    await page.getByRole("button", { name: "Retirer", exact: true }).click();
    await expect(page.getByText("1 arrêt à retirer")).toHaveCount(0, { timeout: 10000 });
    const remainingStop = await sql`SELECT id FROM "TourStop" WHERE id = ${cancelledStopId}`;
    expect(remainingStop.length).toBe(0);
    // Le rendez-vous annulé lui-même reste intact (l'action n'a touché que l'arrêt).
    const [appointment] = await sql`SELECT status FROM "Appointment" WHERE id = ${cancelledAppointmentId}`;
    expect(appointment.status).toBe("CANCELLED");
  });
});
