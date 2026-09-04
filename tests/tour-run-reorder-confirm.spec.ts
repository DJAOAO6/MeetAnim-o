import { randomBytes } from "node:crypto";
import { config } from "dotenv";
import { expect, test, type Page } from "@playwright/test";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.local" });

/**
 * Unification des tournées, phase 3 ter — correctif : un réordonnancement
 * qui changerait l'heure d'un rendez-vous flexible ne doit jamais s'appliquer
 * en silence. Date de test fixe et éloignée (2027) pour ne jamais entrer en
 * collision avec une vraie tournée créée par la praticienne pendant que ce
 * test tourne.
 */

const testEmail = "praticien-test@pf-osteo-animale.fr";
const testPassword = "Praticien-Test-2026!";
const testDateId = "2027-04-13"; // mardi, sans lien avec une vraie tournée
const testOwnerLastName = "E2EReorderConfirmTest";
const stopALabel = "RexReorderConfirmA";
const stopBLabel = "RexReorderConfirmB";

function fakeCuid(): string {
  return `c${randomBytes(12).toString("hex")}`;
}

async function seedTourRunWithTwoStops(): Promise<{ tourRunId: string; appointmentAId: string; appointmentBId: string; stopAId: string; stopBId: string }> {
  const sql = neon(process.env.DATABASE_URL!);
  const clientId = fakeCuid();
  const appointmentAId = fakeCuid();
  const appointmentBId = fakeCuid();
  const tourRunId = fakeCuid();
  const stopAId = fakeCuid();
  const stopBId = fakeCuid();

  await sql`INSERT INTO "Client" (id, "firstName", "lastName", phone, email, city, address, "updatedAt") VALUES (${clientId}, 'Prénom', ${testOwnerLastName}, '0611223344', 'e2e-reorderconfirm@example.fr', 'Rouen', '12 rue de Test', now())`;

  // Arrêt A : verrouillé, garde toujours son heure — sert de point de
  // comparaison (jamais concerné par la confirmation). Placé l'après-midi,
  // largement à l'écart de l'heure recalculée pour B, pour ne pas provoquer
  // un chevauchement incident non lié au scénario testé.
  await sql`
    INSERT INTO "Appointment" (id, "clientId", "clientName", "animalName", "animalSpecies", "serviceName", date, start, duration, mode, location, "postalCode", city, latitude, longitude, price, status, notes, "createdAt", "updatedAt")
    VALUES (${appointmentAId}, ${clientId}, ${"Client " + testOwnerLastName}, ${stopALabel}, 'Chien', 'Ostéopathie canine', ${testDateId}::date, '15:00', 30, 'DOMICILE', '12 rue de Test', '76000', 'Rouen', 49.4432, 1.0999, 60, 'CONFIRMED', '', now(), now())
  `;
  // Arrêt B : flexible dès le départ — c'est celui dont l'heure doit
  // changer si on le fait passer en premier.
  await sql`
    INSERT INTO "Appointment" (id, "clientId", "clientName", "animalName", "animalSpecies", "serviceName", date, start, duration, mode, location, "postalCode", city, latitude, longitude, price, status, notes, "createdAt", "updatedAt")
    VALUES (${appointmentBId}, ${clientId}, ${"Client " + testOwnerLastName}, ${stopBLabel}, 'Chien', 'Ostéopathie canine', ${testDateId}::date, '11:00', 30, 'DOMICILE', '40 rue du Havre', '76600', 'Le Havre', 49.4939, 0.1079, 60, 'CONFIRMED', '', now(), now())
  `;

  await sql`
    INSERT INTO "TourRun" (id, "userId", date, name, "departureTime", "startType", "startAddress", "startLatitude", "startLongitude", "endType", "endAddress", "endLatitude", "endLongitude", "createdAt", "updatedAt")
    SELECT ${tourRunId}, u.id, ${testDateId}::date, ${"Tournée " + testOwnerLastName}, '09:00', 'CABINET', 'Cabinet', 49.44, 1.09, 'CABINET', 'Cabinet', 49.44, 1.09, now(), now()
    FROM "User" u WHERE u.email = ${testEmail}
  `;
  await sql`INSERT INTO "TourStop" (id, "tourRunId", "appointmentId", "order", type, label, address, latitude, longitude, locked, flexible, "arrivalTime", "createdAt", "updatedAt") VALUES (${stopAId}, ${tourRunId}, ${appointmentAId}, 0, 'APPOINTMENT', ${stopALabel}, '12 rue de Test, Rouen', 49.4432, 1.0999, true, false, '15:00', now(), now())`;
  await sql`INSERT INTO "TourStop" (id, "tourRunId", "appointmentId", "order", type, label, address, latitude, longitude, locked, flexible, "arrivalTime", "createdAt", "updatedAt") VALUES (${stopBId}, ${tourRunId}, ${appointmentBId}, 1, 'APPOINTMENT', ${stopBLabel}, '40 rue du Havre, Le Havre', 49.4939, 0.1079, false, true, '11:00', now(), now())`;

  return { tourRunId, appointmentAId, appointmentBId, stopAId, stopBId };
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

test.describe("Réordonnancement — confirmation avant de déplacer un rendez-vous", () => {
  test.beforeEach(async () => {
    await clearLoginRateLimit();
    await cleanup();
  });

  test.afterEach(async () => {
    await cleanup();
  });

  test("confirmer applique le nouvel horaire au vrai rendez-vous", async ({ page }) => {
    const { appointmentBId } = await seedTourRunWithTwoStops();
    await login(page);
    await page.goto(`/dashboard/tournees?date=${testDateId}`);
    await expect(page.getByText(stopBLabel)).toBeVisible({ timeout: 10000 });

    // B (flexible, actuellement second) passe en premier.
    await page.getByRole("button", { name: `Monter ${stopBLabel}` }).click();

    const confirmDialog = page.locator('[role="dialog"]').filter({ hasText: "va changer d" });
    await expect(confirmDialog).toBeVisible({ timeout: 10000 });
    await expect(confirmDialog.getByText(/^11:00/)).toBeVisible();

    const sql = neon(process.env.DATABASE_URL!);
    const [beforeConfirm] = await sql`SELECT start FROM "Appointment" WHERE id = ${appointmentBId}`;
    expect(beforeConfirm.start).toBe("11:00"); // rien écrit tant que non confirmé

    await page.getByRole("button", { name: "Confirmer les nouveaux horaires" }).click();
    await expect(page.getByText("Rendez-vous replacé.")).toBeVisible({ timeout: 10000 });

    const [afterConfirm] = await sql`SELECT start FROM "Appointment" WHERE id = ${appointmentBId}`;
    expect(afterConfirm.start).not.toBe("11:00");
  });

  test("un nouvel horaire refusé pour conflit ne modifie ni le rendez-vous ni l'ordre", async ({ page }) => {
    const sql = neon(process.env.DATABASE_URL!);
    const { appointmentAId, appointmentBId, stopBId } = await seedTourRunWithTwoStops();
    // A tôt le matin : le nouvel horaire recalculé pour B (parti en premier)
    // tombe dedans — le rendez-vous doit être refusé, rien ne doit bouger.
    await sql`UPDATE "Appointment" SET start = '09:35' WHERE id = ${appointmentAId}`;
    await sql`UPDATE "TourStop" SET "arrivalTime" = '09:35' WHERE "appointmentId" = ${appointmentAId}`;

    await login(page);
    await page.goto(`/dashboard/tournees?date=${testDateId}`);
    await expect(page.getByText(stopBLabel)).toBeVisible({ timeout: 10000 });

    await page.getByRole("button", { name: `Monter ${stopBLabel}` }).click();
    const confirmDialog = page.locator('[role="dialog"]').filter({ hasText: "va changer d" });
    await expect(confirmDialog).toBeVisible({ timeout: 10000 });

    await page.getByRole("button", { name: "Confirmer les nouveaux horaires" }).click();
    await expect(page.getByText(/chevauche/)).toBeVisible({ timeout: 10000 });

    const [appointment] = await sql`SELECT start FROM "Appointment" WHERE id = ${appointmentBId}`;
    expect(appointment.start).toBe("11:00");
    const [stop] = await sql`SELECT "order" FROM "TourStop" WHERE id = ${stopBId}`;
    expect(stop.order).toBe(1);
  });

  test("annuler ne modifie rien", async ({ page }) => {
    const { appointmentBId, stopBId } = await seedTourRunWithTwoStops();
    await login(page);
    await page.goto(`/dashboard/tournees?date=${testDateId}`);
    await expect(page.getByText(stopBLabel)).toBeVisible({ timeout: 10000 });

    await page.getByRole("button", { name: `Monter ${stopBLabel}` }).click();
    await expect(page.getByText(/rendez-vous va changer d.?heure|1 rendez-vous va changer/)).toBeVisible({ timeout: 10000 });

    await page.getByRole("button", { name: "Annuler", exact: true }).click();
    await expect(page.getByText(/rendez-vous va changer d.?heure|1 rendez-vous va changer/)).toHaveCount(0);

    const sql = neon(process.env.DATABASE_URL!);
    const [appointment] = await sql`SELECT start FROM "Appointment" WHERE id = ${appointmentBId}`;
    expect(appointment.start).toBe("11:00");
    const [stop] = await sql`SELECT "order" FROM "TourStop" WHERE id = ${stopBId}`;
    expect(stop.order).toBe(1); // l'ordre n'a pas non plus bougé
  });

  test("réordonner deux arrêts verrouillés n'affiche aucune confirmation", async ({ page }) => {
    const sql = neon(process.env.DATABASE_URL!);
    const { stopAId, stopBId } = await seedTourRunWithTwoStops();
    // Les deux verrouillés pour ce scénario : aucun rendez-vous ne peut bouger.
    await sql`UPDATE "TourStop" SET locked = true, flexible = false WHERE id IN (${stopAId}, ${stopBId})`;

    await login(page);
    await page.goto(`/dashboard/tournees?date=${testDateId}`);
    await expect(page.getByText(stopBLabel)).toBeVisible({ timeout: 10000 });

    await page.getByRole("button", { name: `Monter ${stopBLabel}` }).click();
    await page.waitForTimeout(1500); // laisse le recalcul serveur se terminer

    await expect(page.getByText(/rendez-vous va changer d.?heure|1 rendez-vous va changer/)).toHaveCount(0);
    const [stop] = await sql`SELECT "order" FROM "TourStop" WHERE id = ${stopBId}`;
    expect(stop.order).toBe(0); // appliqué directement, sans confirmation
  });
});
