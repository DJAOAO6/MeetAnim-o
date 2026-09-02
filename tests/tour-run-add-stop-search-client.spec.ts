import { randomBytes } from "node:crypto";
import { config } from "dotenv";
import { expect, test, type Page } from "@playwright/test";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.local" });

/**
 * Unification des tournées, phase 3 quater (recherche unifiée) : depuis
 * "+ Ajouter un arrêt" → "Rechercher un client", choisir un animal ouvre le
 * formulaire de création de rendez-vous déjà existant (phase 3 bis) —
 * jamais un chemin parallèle. Date de test fixe et éloignée (2027) pour ne
 * jamais entrer en collision avec une vraie tournée créée par la
 * praticienne pendant que ce test tourne.
 */

const testEmail = "praticien-test@pf-osteo-animale.fr";
const testPassword = "Praticien-Test-2026!";
const testDateId = "2027-03-27"; // samedi, sans lien avec une vraie tournée
const testOwnerLastName = "E2EAddStopSearchTest";
const testAnimalName = "RexAddStopSearch";

function fakeCuid(): string {
  return `c${randomBytes(12).toString("hex")}`;
}

async function seedClientAndTourRun(): Promise<{ tourRunId: string }> {
  const sql = neon(process.env.DATABASE_URL!);
  const clientId = fakeCuid();
  const tourRunId = fakeCuid();
  await sql`INSERT INTO "Client" (id, "firstName", "lastName", phone, email, city, address, latitude, longitude, "updatedAt") VALUES (${clientId}, 'Prénom', ${testOwnerLastName}, '0611223344', 'e2e-addstopsearch@example.fr', 'Rouen', '12 rue de Test', 49.4432, 1.0999, now())`;
  await sql`INSERT INTO "Animal" (id, "clientId", name, species, breed, age, weight, sex, avatar, "avatarBackground", history, conditions, treatments, notes, "updatedAt") VALUES (${fakeCuid()}, ${clientId}, ${testAnimalName}, 'Chien', '', '', '', '', '', '', '', '', '', '', now())`;
  await sql`
    INSERT INTO "TourRun" (id, "userId", date, name, "departureTime", "startType", "startAddress", "startLatitude", "startLongitude", "endType", "endAddress", "endLatitude", "endLongitude", "createdAt", "updatedAt")
    SELECT ${tourRunId}, u.id, ${testDateId}::date, ${"Tournée " + testOwnerLastName}, '09:00', 'CABINET', 'Cabinet', 49.44, 1.09, 'CABINET', 'Cabinet', 49.44, 1.09, now(), now()
    FROM "User" u WHERE u.email = ${testEmail}
  `;
  return { tourRunId };
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

test.describe("Ajouter un arrêt — rechercher un client", () => {
  test.beforeEach(async () => {
    await clearLoginRateLimit();
    await cleanup();
  });

  test.afterEach(async () => {
    await cleanup();
  });

  test("choisir un animal dans la recherche ouvre le formulaire et crée un vrai rendez-vous", async ({ page }) => {
    const { tourRunId } = await seedClientAndTourRun();
    await login(page);

    await page.goto(`/dashboard/tournees?date=${testDateId}`);
    await expect(page.getByText(`Tournée ${testOwnerLastName}`)).toBeVisible({ timeout: 10000 });

    await page.getByRole("button", { name: "+ Ajouter un arrêt" }).click();
    await page.getByRole("button", { name: "Rechercher un client" }).click();

    await page.getByPlaceholder("Rechercher un animal ou son propriétaire").fill(testAnimalName);
    const option = page.getByRole("option", { name: new RegExp(testAnimalName) });
    await expect(option).toBeVisible({ timeout: 10000 });
    await option.click();

    // Le formulaire de création de rendez-vous (phase 3 bis) s'ouvre, préempli.
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText(testAnimalName)).toBeVisible({ timeout: 10000 });
    await dialog.getByRole("button", { name: "Ajouter à la tournée" }).click();

    await expect(page.getByText(/Rendez-vous créé et ajouté/)).toBeVisible({ timeout: 15000 });

    const sql = neon(process.env.DATABASE_URL!);
    const appointments = await sql`SELECT id, mode, status FROM "Appointment" WHERE "animalName" = ${testAnimalName}`;
    expect(appointments).toHaveLength(1);
    expect(appointments[0].mode).toBe("DOMICILE");
    expect(appointments[0].status).toBe("CONFIRMED");

    const stops = await sql`SELECT "appointmentId" FROM "TourStop" WHERE "tourRunId" = ${tourRunId}`;
    expect(stops).toHaveLength(1);
    expect(stops[0].appointmentId).toBe(appointments[0].id);
  });
});
