import { randomBytes } from "node:crypto";
import { config } from "dotenv";
import { expect, test, type Page } from "@playwright/test";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.local" });

/**
 * Refonte tournées — étape 3 : timeline des arrêts + recherche client/animal.
 * Étape 4 : raccourcis de navigation (itinéraire complet, menu Y aller).
 */

const testEmail = "praticien-test@pf-osteo-animale.fr";
const testPassword = "Praticien-Test-2026!";
const tourName = "Tournée E2E Timeline";
const zoneName = "Zone E2E Timeline";
const animalName = "RexTimelineE2E";
const clientLastName = "E2ETimelineClient";
const navTourName = "Tournée E2E Navigation";
const navZoneName = "Zone E2E Navigation";
const navClientLastName = "E2ENavClient";

function fakeCuid(): string {
  return `c${randomBytes(12).toString("hex")}`;
}

function formatDateId(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/**
 * Le formulaire de tournée par défaut à "Lundi" (jour) sans ancre — la
 * prochaine occurrence tombe donc sur le prochain lundi (aujourd'hui inclus),
 * même logique que nextOccurrenceDateId (tour-schedule.ts).
 */
function nextMondayDateId(): string {
  const today = new Date();
  const diff = (1 - today.getDay() + 7) % 7;
  return formatDateId(new Date(today.getFullYear(), today.getMonth(), today.getDate() + diff));
}

async function grantPermission() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`UPDATE "User" SET permissions = ARRAY['MANAGE_PUBLIC_SETTINGS'] WHERE email = ${testEmail}`;
}

async function cleanup() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`DELETE FROM "Appointment" WHERE "clientName" LIKE ${"%" + clientLastName} OR "clientName" LIKE ${"%" + navClientLastName}`;
  await sql`DELETE FROM "Tour" WHERE name LIKE ${tourName + "%"} OR name LIKE ${navTourName + "%"}`;
  await sql`DELETE FROM "Zone" WHERE name IN (${zoneName}, ${navZoneName})`;
  await sql`DELETE FROM "Client" WHERE "lastName" IN (${clientLastName}, ${navClientLastName})`;
}

async function seedClientAndAnimal(): Promise<{ clientId: string; animalId: string }> {
  const sql = neon(process.env.DATABASE_URL!);
  const clientId = fakeCuid();
  const animalId = fakeCuid();
  await sql`INSERT INTO "Client" (id, "firstName", "lastName", phone, email, city, address, "updatedAt") VALUES (${clientId}, 'Prénom', ${clientLastName}, '0600000000', 'timeline-e2e@example.fr', 'Rouen', '1 rue de Test', now())`;
  await sql`INSERT INTO "Animal" (id, "clientId", name, species, breed, age, weight, sex, avatar, "avatarBackground", history, conditions, treatments, notes, "updatedAt") VALUES (${animalId}, ${clientId}, ${animalName}, 'Chien', '', '', '', '', '', '', '', '', '', '', now())`;
  return { clientId, animalId };
}

/**
 * Deux rendez-vous à domicile réels avec coordonnées géolocalisées, pour
 * exercer buildTourMapsLinks (nécessite au moins deux arrêts localisés) et
 * le bouton "Y aller" par arrêt — insérés directement en base (pas besoin de
 * geocoder réellement, contrairement au test de recherche ci-dessus).
 */
async function seedLocatedAppointments(dateId: string) {
  const sql = neon(process.env.DATABASE_URL!);
  for (const [index, name] of ["RexNav1", "RexNav2"].entries()) {
    await sql`
      INSERT INTO "Appointment" (id, "clientName", "animalName", "animalSpecies", "serviceName", date, start, duration, mode, location, "postalCode", city, latitude, longitude, price, status, notes, "createdAt", "updatedAt")
      VALUES (${fakeCuid()}, ${"Client " + navClientLastName}, ${name}, 'Chien', 'Ostéopathie canine', ${dateId}::date, ${index === 0 ? "10:00" : "11:00"}, 30, 'DOMICILE', '12 rue de Test', '76000', 'Rouen', 49.4432, 1.0999, 60, 'CONFIRMED', '', now(), now())
    `;
  }
}

async function login(page: Page) {
  await page.goto("/login");
  await page.fill('input[type="email"]', testEmail);
  await page.fill('input[type="password"]', testPassword);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard**", { timeout: 10000 });
}

test.describe("Tournées — timeline des arrêts", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(grantPermission);
  test.beforeEach(async ({ page }) => {
    const sql = neon(process.env.DATABASE_URL!);
    await sql`DELETE FROM "RateLimitEvent" WHERE key LIKE 'login:%'`;
    await cleanup();
    await login(page);
  });
  test.afterAll(cleanup);

  test("rechercher un animal par son nom et l'ajouter comme arrêt le fait apparaître dans la timeline", async ({ page }) => {
    await seedClientAndAnimal();

    await page.goto("/dashboard/tournees");
    await page.getByRole("button", { name: /^Zones/ }).click();
    const zonesPanel = page.locator('[role="dialog"][aria-labelledby="zones-panel-title"]');
    await expect(zonesPanel).toBeVisible({ timeout: 10000 });
    await zonesPanel.getByRole("button", { name: "+ Nouvelle zone" }).click();
    const zoneDialog = page.locator('[role="dialog"]').filter({ hasText: "Créer une zone" });
    await zoneDialog.getByPlaceholder("Ex. Zone Le Havre").fill(zoneName);
    await zoneDialog.getByPlaceholder("Ville").fill("Rouen");
    await zoneDialog.getByPlaceholder("Code postal").fill("76000");
    await zoneDialog.getByRole("button", { name: "Créer la zone" }).click();
    await expect(zoneDialog).toHaveCount(0, { timeout: 10000 });
    await zonesPanel.getByRole("button", { name: "Fermer" }).click();
    await expect(zonesPanel).toHaveCount(0, { timeout: 10000 });

    await page.getByRole("button", { name: "+ Nouvelle tournée", exact: true }).click();
    const tourDialog = page.locator('[role="dialog"]').first();
    await tourDialog.locator('input[placeholder="Ex. Secteur Dieppe"]').fill(tourName);
    await tourDialog.getByRole("button", { name: zoneName, exact: true }).click();
    await tourDialog.getByRole("button", { name: "Créer la tournée" }).click();
    await expect(tourDialog).toHaveCount(0, { timeout: 10000 });

    await page.getByRole("button", { name: new RegExp(tourName) }).click();
    await expect(page.getByRole("heading", { name: tourName })).toBeVisible({ timeout: 10000 });

    await page.getByRole("button", { name: "+ Ajouter un arrêt" }).click();
    await page.getByPlaceholder("Rechercher un animal (nom)").fill(animalName);
    await expect(page.getByRole("button", { name: new RegExp(animalName) })).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: new RegExp(animalName) }).click();

    await expect(page.getByRole("button", { name: "Ajouter à la tournée" })).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: "Ajouter à la tournée" }).click();

    await expect(page.getByText(new RegExp(animalName))).toBeVisible({ timeout: 15000 });
  });

  test("l'itinéraire complet et le menu « Y aller » proposent bien les 3 applications et mémorisent le choix", async ({ page }) => {
    await seedLocatedAppointments(nextMondayDateId());

    await page.goto("/dashboard/tournees");
    await page.getByRole("button", { name: /^Zones/ }).click();
    const zonesPanel = page.locator('[role="dialog"][aria-labelledby="zones-panel-title"]');
    await expect(zonesPanel).toBeVisible({ timeout: 10000 });
    await zonesPanel.getByRole("button", { name: "+ Nouvelle zone" }).click();
    const zoneDialog = page.locator('[role="dialog"]').filter({ hasText: "Créer une zone" });
    await zoneDialog.getByPlaceholder("Ex. Zone Le Havre").fill(navZoneName);
    await zoneDialog.getByPlaceholder("Ville").fill("Rouen");
    await zoneDialog.getByPlaceholder("Code postal").fill("76000");
    await zoneDialog.getByRole("button", { name: "Créer la zone" }).click();
    await expect(zoneDialog).toHaveCount(0, { timeout: 10000 });
    await zonesPanel.getByRole("button", { name: "Fermer" }).click();
    await expect(zonesPanel).toHaveCount(0, { timeout: 10000 });

    // Formulaire laissé par défaut sur "Lundi" (jour) : matche nextMondayDateId ci-dessus.
    await page.getByRole("button", { name: "+ Nouvelle tournée", exact: true }).click();
    const tourDialog = page.locator('[role="dialog"]').first();
    await tourDialog.locator('input[placeholder="Ex. Secteur Dieppe"]').fill(navTourName);
    await tourDialog.getByRole("button", { name: navZoneName, exact: true }).click();
    await tourDialog.getByRole("button", { name: "Créer la tournée" }).click();
    await expect(tourDialog).toHaveCount(0, { timeout: 10000 });

    await page.getByRole("button", { name: new RegExp(navTourName) }).click();
    await expect(page.getByRole("heading", { name: navTourName })).toBeVisible({ timeout: 10000 });

    // Itinéraire complet : deux arrêts localisés dans la même zone suffisent.
    await expect(page.getByRole("link", { name: "Ouvrir l’itinéraire complet" })).toBeVisible({ timeout: 10000 });

    // Menu "Y aller" du premier arrêt : les 3 applications sont proposées.
    const firstStop = page.locator("li", { hasText: "RexNav1" });
    await firstStop.getByRole("button", { name: "Choisir l’application de navigation" }).click();
    await expect(firstStop.getByRole("menuitem", { name: "Google Maps" })).toBeVisible();
    await expect(firstStop.getByRole("menuitem", { name: "Waze" })).toBeVisible();
    await expect(firstStop.getByRole("menuitem", { name: "Plans (Apple)" })).toBeVisible();

    await firstStop.getByRole("menuitem", { name: "Waze" }).click();
    const stored = await page.evaluate(() => window.localStorage.getItem("animeo:nav-provider"));
    expect(stored).toBe("waze");

    // Préférence mémorisée : après rechargement, le lien principal "Y aller" pointe vers Waze.
    await page.reload();
    await page.getByRole("button", { name: new RegExp(navTourName) }).click();
    await expect(page.getByRole("heading", { name: navTourName })).toBeVisible({ timeout: 10000 });
    const goLink = page.locator("li", { hasText: "RexNav1" }).getByRole("link", { name: "Y aller" });
    await expect(goLink).toHaveAttribute("href", /waze\.com/);
  });
});
