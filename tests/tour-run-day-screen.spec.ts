import { randomBytes } from "node:crypto";
import { config } from "dotenv";
import { expect, test, type Page } from "@playwright/test";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.local" });

/**
 * Écran de journée unifié (unification des tournées, phase 3) : actions par
 * arrêt (Appeler / Y aller / Terminé) et message de progression. Date de
 * test fixe et éloignée (2027) pour ne jamais entrer en collision avec une
 * vraie tournée créée par la praticienne pendant que ce test tourne.
 */

const testEmail = "praticien-test@pf-osteo-animale.fr";
const testPassword = "Praticien-Test-2026!";
const testDateId = "2027-03-17"; // mercredi, sans lien avec une vraie tournée
const testOwnerLastName = "E2EDayScreenTest";

function fakeCuid(): string {
  return `c${randomBytes(12).toString("hex")}`;
}

async function cleanupTestData() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`DELETE FROM "TourRun" WHERE date = ${testDateId}::date AND name LIKE ${"%" + testOwnerLastName + "%"}`;
  await sql`DELETE FROM "Appointment" WHERE "clientName" LIKE ${"%" + testOwnerLastName}`;
  await sql`DELETE FROM "Client" WHERE "lastName" = ${testOwnerLastName}`;
}

async function clearLoginRateLimit() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`DELETE FROM "RateLimitEvent" WHERE key LIKE 'login:%'`;
}

async function seedTourRunWithStop(): Promise<{ tourRunId: string; appointmentId: string }> {
  const sql = neon(process.env.DATABASE_URL!);
  const clientId = fakeCuid();
  const appointmentId = fakeCuid();
  const tourRunId = fakeCuid();
  const stopId = fakeCuid();
  await sql`INSERT INTO "Client" (id, "firstName", "lastName", phone, email, city, address, "updatedAt") VALUES (${clientId}, 'Prénom', ${testOwnerLastName}, '0611223344', 'e2e-day-screen@example.fr', 'Rouen', '12 rue de Test', now())`;
  await sql`
    INSERT INTO "Appointment" (id, "clientId", "clientName", "animalName", "animalSpecies", "serviceName", date, start, duration, mode, location, "postalCode", city, latitude, longitude, price, status, notes, "createdAt", "updatedAt")
    VALUES (${appointmentId}, ${clientId}, ${"Client " + testOwnerLastName}, 'RexE2EDayScreen', 'Chien', 'Ostéopathie canine', ${testDateId}::date, '10:00', 30, 'DOMICILE', '12 rue de Test', '76000', 'Rouen', 49.4432, 1.0999, 60, 'CONFIRMED', '', now(), now())
  `;
  await sql`
    INSERT INTO "TourRun" (id, "userId", date, name, "startType", "startAddress", "startLatitude", "startLongitude", "endType", "endAddress", "endLatitude", "endLongitude", "createdAt", "updatedAt")
    SELECT ${tourRunId}, u.id, ${testDateId}::date, ${"Tournée " + testOwnerLastName}, 'CABINET', 'Cabinet', 49.44, 1.09, 'CABINET', 'Cabinet', 49.44, 1.09, now(), now()
    FROM "User" u WHERE u.email = ${testEmail}
  `;
  await sql`
    INSERT INTO "TourStop" (id, "tourRunId", "appointmentId", "order", type, label, address, latitude, longitude, "createdAt", "updatedAt")
    VALUES (${stopId}, ${tourRunId}, ${appointmentId}, 0, 'APPOINTMENT', 'RexE2EDayScreen', '12 rue de Test, Rouen', 49.4432, 1.0999, now(), now())
  `;
  return { tourRunId, appointmentId };
}

async function login(page: Page) {
  await page.goto("/login");
  await page.fill('input[type="email"]', testEmail);
  await page.fill('input[type="password"]', testPassword);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard**", { timeout: 10000 });
}

test.describe("Écran de journée unifié — actions par arrêt", () => {
  test.beforeEach(async () => {
    await clearLoginRateLimit();
    await cleanupTestData();
  });

  test.afterEach(async () => {
    await cleanupTestData();
  });

  test("affiche la progression et permet de marquer un arrêt comme réalisé", async ({ page }) => {
    await seedTourRunWithStop();
    await login(page);

    await page.goto(`/dashboard/tournees?date=${testDateId}`);
    await expect(page.getByText(`Tournée ${testOwnerLastName}`)).toBeVisible({ timeout: 10000 });

    // Avant réalisation : message de progression "à venir" et actions par arrêt visibles.
    await expect(page.getByText(/arrêt.*à venir/)).toBeVisible();
    await expect(page.getByRole("link", { name: "Appeler" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Y aller/ })).toBeVisible();
    const completeButton = page.getByRole("button", { name: "Terminé", exact: true });
    await expect(completeButton).toBeVisible();

    // Suppression discrète en bas de page, hors de la rangée d'actions principale.
    await expect(page.getByRole("button", { name: "Supprimer cette journée" })).toBeVisible();

    await completeButton.click();

    // Après réalisation : badge "Terminé à HH:MM", bouton "Terminé" disparu, progression à jour en base.
    await expect(page.getByText(/Terminé à \d{2}:\d{2}/)).toBeVisible({ timeout: 10000 });
    await expect(completeButton).toHaveCount(0);
    await expect(page.getByText("Tous les arrêts sont terminés.")).toBeVisible();

    const sql = neon(process.env.DATABASE_URL!);
    const rows = await sql`SELECT status, "completedAt" FROM "Appointment" WHERE "clientName" LIKE ${"%" + testOwnerLastName}`;
    expect(rows[0]?.status).toBe("COMPLETED");
    expect(rows[0]?.completedAt).not.toBeNull();
  });
});
