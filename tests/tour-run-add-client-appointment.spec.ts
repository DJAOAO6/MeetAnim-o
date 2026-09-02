import { randomBytes } from "node:crypto";
import { config } from "dotenv";
import { expect, test, type Page } from "@playwright/test";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.local" });

/**
 * Unification des tournées, phase 3 bis (suite) : "ajouter à cette journée"
 * depuis un client de la carte crée un vrai rendez-vous à domicile (via
 * saveAppointmentAction — mêmes contrôles de conflit/tampon de trajet que
 * partout ailleurs), puis l'attache à la journée comme un arrêt normal —
 * jamais un TourStop manuel sans rendez-vous derrière. Date de test fixe et
 * éloignée (2027) pour ne jamais entrer en collision avec une vraie
 * tournée créée par la praticienne pendant que ce test tourne.
 */

const testEmail = "praticien-test@pf-osteo-animale.fr";
const testPassword = "Praticien-Test-2026!";
const testDateId = "2027-03-21"; // dimanche, sans lien avec une vraie tournée
const testOwnerLastName = "E2EClientApptTest";
const testAnimalName = "RexClientApptTest";

function fakeCuid(): string {
  return `c${randomBytes(12).toString("hex")}`;
}

async function seedClientAndTourRun(): Promise<{ clientId: string; tourRunId: string }> {
  const sql = neon(process.env.DATABASE_URL!);
  const clientId = fakeCuid();
  const tourRunId = fakeCuid();
  // Position posée directement sur la fiche client (Client.latitude/
  // longitude) — pas besoin d'un rendez-vous préexistant pour apparaître
  // sur le calque clients (voir getMapClients, phase 3 bis).
  await sql`INSERT INTO "Client" (id, "firstName", "lastName", phone, email, city, address, latitude, longitude, "updatedAt") VALUES (${clientId}, 'Prénom', ${testOwnerLastName}, '0611223344', 'e2e-clientappt@example.fr', 'Rouen', '1 place du Vieux Marché', 49.4432, 1.0999, now())`;
  await sql`INSERT INTO "Animal" (id, "clientId", name, species, breed, age, weight, sex, avatar, "avatarBackground", history, conditions, treatments, notes, "updatedAt") VALUES (${fakeCuid()}, ${clientId}, ${testAnimalName}, 'Chien', '', '', '', '', '', '', '', '', '', '', now())`;
  await sql`
    INSERT INTO "TourRun" (id, "userId", date, name, "startType", "startAddress", "startLatitude", "startLongitude", "endType", "endAddress", "endLatitude", "endLongitude", "createdAt", "updatedAt")
    SELECT ${tourRunId}, u.id, ${testDateId}::date, ${"Tournée " + testOwnerLastName}, 'CABINET', 'Cabinet', 49.44, 1.09, 'CABINET', 'Cabinet', 49.44, 1.09, now(), now()
    FROM "User" u WHERE u.email = ${testEmail}
  `;
  return { clientId, tourRunId };
}

async function cleanup() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`DELETE FROM "TourRun" WHERE date = ${testDateId}::date AND name LIKE ${"%" + testOwnerLastName + "%"}`;
  await sql`DELETE FROM "Appointment" WHERE "animalName" = ${testAnimalName}`;
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

test.describe("Carte de tournée — ajouter un client comme rendez-vous", () => {
  test.beforeEach(async () => {
    await clearLoginRateLimit();
    await cleanup();
  });

  test.afterEach(async () => {
    await cleanup();
  });

  test("crée un vrai rendez-vous à domicile et l'attache à la journée comme arrêt", async ({ page }) => {
    const { tourRunId } = await seedClientAndTourRun();
    await login(page);

    await page.goto(`/dashboard/tournees?date=${testDateId}`);
    await expect(page.getByText(`Tournée ${testOwnerLastName}`)).toBeVisible({ timeout: 10000 });

    await page.getByRole("button", { name: /Afficher les clients du secteur/ }).click();
    const marker = page.getByRole("button", { name: new RegExp(testAnimalName) });
    await expect(marker).toBeVisible({ timeout: 10000 });
    await marker.click();

    await expect(page.getByText(`${testAnimalName} — Prénom ${testOwnerLastName}`)).toBeVisible({ timeout: 5000 });
    await page.getByRole("button", { name: "Ajouter à la tournée", exact: true }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 5000 });
    await dialog.getByRole("button", { name: "Ajouter à la tournée" }).click();

    await expect(page.getByText(/Rendez-vous créé et ajouté/)).toBeVisible({ timeout: 15000 });

    // Vérification de l'état réel en base, pas seulement du DOM : un vrai
    // rendez-vous à domicile (jamais un arrêt manuel sans rendez-vous),
    // attaché à la journée comme un arrêt normal.
    const sql = neon(process.env.DATABASE_URL!);
    const appointments = await sql`SELECT id, mode, status, "clientId" FROM "Appointment" WHERE "animalName" = ${testAnimalName}`;
    expect(appointments).toHaveLength(1);
    expect(appointments[0].mode).toBe("DOMICILE");
    expect(appointments[0].status).toBe("CONFIRMED");
    expect(appointments[0].clientId).toBeTruthy();

    const stops = await sql`SELECT "appointmentId", type FROM "TourStop" WHERE "tourRunId" = ${tourRunId}`;
    expect(stops).toHaveLength(1);
    expect(stops[0].appointmentId).toBe(appointments[0].id);
    expect(stops[0].type).toBe("APPOINTMENT");
  });
});
