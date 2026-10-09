import { config } from "dotenv";
import { expect, test, type Page } from "./helpers/test";
import { neon } from "./helpers/sql";

config({ path: ".env.local" });

/**
 * Phase 8.9 sur la carte : un client dont le chien vit chez lui et le cheval
 * au haras apparaît aux deux endroits ; la fiche d'un point donne l'adresse
 * de cet endroit ; un rendez-vous prend l'adresse du lieu de l'animal ; une
 * tournée préparée ne fait qu'un arrêt pour un haras partagé.
 */

const testEmail = "praticien-test@pf-osteo-animale.fr";
const testPassword = "Praticien-Test-2026!";
const PLACE = "Haras E2E Carte";
const TOUR_NAME = "Tournée E2E Lieux";

async function cleanup() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`DELETE FROM "TourStop" WHERE "tourRunId" IN (SELECT id FROM "TourRun" WHERE name = ${TOUR_NAME})`;
  await sql`DELETE FROM "TourRun" WHERE name = ${TOUR_NAME}`;
  await sql`DELETE FROM "Animal" WHERE id LIKE 'tmp-pmap-animal-%'`;
  await sql`DELETE FROM "Client" WHERE id LIKE 'tmp-pmap-client-%'`;
  await sql`DELETE FROM "AnimalPlace" WHERE id = 'tmp-pmap-place'`;
}

async function seed() {
  const sql = neon(process.env.DATABASE_URL!);
  // Zone vide de clients de démonstration (pays de Caux).
  await sql`INSERT INTO "AnimalPlace" (id, name, kind, address, "postalCode", city, latitude, longitude, "geocodePrecision", "geocodedAt", "updatedAt") VALUES ('tmp-pmap-place', ${PLACE}, 'HARAS', '1 route du Haras', '76760', 'Yerville', 49.57, 0.57, 'EXACT', now(), now())`;
  await sql`INSERT INTO "Client" (id, "firstName", "lastName", phone, email, city, address, latitude, longitude, "geocodePrecision", "updatedAt") VALUES ('tmp-pmap-client-a', 'Test', 'DeuxLieuxE2E', '0600000091', 'pmap-a@example.fr', 'Motteville', '2 rue Test', 49.55, 0.55, 'EXACT', now())`;
  await sql`INSERT INTO "Client" (id, "firstName", "lastName", phone, email, city, address, "updatedAt") VALUES ('tmp-pmap-client-b', 'Test', 'HarasSeulE2E', '0600000092', 'pmap-b@example.fr', 'Paris', '3 rue Test', now())`;
  // Le cheval (premier par ordre alphabétique) vit au haras, le chien chez son propriétaire.
  for (const [id, clientId, name, species, placeId] of [
    ["a1", "tmp-pmap-client-a", "AlezanE2E", "Cheval", "tmp-pmap-place"],
    ["a2", "tmp-pmap-client-a", "RexE2E", "Chien", null],
    ["b1", "tmp-pmap-client-b", "BaieE2E", "Cheval", "tmp-pmap-place"],
  ] as const) {
    await sql`INSERT INTO "Animal" (id, "clientId", name, species, breed, age, weight, sex, avatar, "avatarBackground", history, conditions, treatments, notes, "placeId", "updatedAt") VALUES (${`tmp-pmap-animal-${id}`}, ${clientId}, ${name}, ${species}, '', '', '', '', '', '', '', '', '', '', ${placeId}, now())`;
  }
}

async function login(page: Page) {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`DELETE FROM "RateLimitEvent" WHERE key LIKE 'login:%'`;
  await page.goto("/login");
  await page.fill('input[type="email"]', testEmail);
  await page.fill('input[type="password"]', testPassword);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard**", { timeout: 10000 });
}

const row = (page: Page, lastName: string) => page.locator("[data-client-row]").filter({ hasText: lastName });
const zone = "/dashboard/carte?lieu=49.56000,0.56000&nom=Test&rayon=5";

test.describe("Lieux des animaux sur la carte", () => {
  test.describe.configure({ mode: "serial" });
  test.beforeAll(async () => { await cleanup(); await seed(); });
  test.afterAll(cleanup);
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  test("deux endroits pour un client, un lieu partagé, la fiche de chaque endroit", async ({ page }) => {
    await page.goto(zone, { waitUntil: "networkidle" });
    // Le client sans domicile localisé est placé au haras, pas « sans position ».
    await expect(row(page, "HarasSeulE2E")).toBeVisible();
    await expect(row(page, "HarasSeulE2E")).not.toContainText("Position inconnue");
    // Domicile de A : son chien.
    await expect(page.locator('.leaflet-marker-icon[title*="DeuxLieuxE2E · RexE2E"]')).toBeVisible();

    // Au haras : les chevaux de A et de B, au même endroit, regroupés.
    const haras = page.locator('.leaflet-marker-icon[title="2 clients ici — afficher le détail"]');
    await haras.click();
    const aAtPlace = page.locator(`.leaflet-marker-icon[title*="DeuxLieuxE2E · AlezanE2E · Cheval · au ${PLACE}"]`);
    await expect(aAtPlace).toBeVisible();
    await expect(page.locator(`.leaflet-marker-icon[title*="HarasSeulE2E · BaieE2E · Cheval · au ${PLACE}"]`)).toBeVisible();

    await aAtPlace.click();
    const card = page.getByRole("button", { name: "Fermer la fiche de Test DeuxLieuxE2E" }).locator("xpath=ancestor::div[contains(@class,'rounded-2xl')][1]");
    await expect(card).toContainText(`Au ${PLACE}, Yerville`);
    await expect(card).toContainText(`AlezanE2E · Cheval · au ${PLACE}`);
    await expect(card.getByRole("link", { name: "Itinéraire" })).toHaveAttribute("href", /destination=49\.57,0\.57/);

    // Nouveau RDV : l'adresse du lieu du cheval est préremplie.
    await card.getByRole("button", { name: "Nouveau RDV" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.locator('input[value="1 route du Haras"]')).toBeVisible();
    await expect(dialog.locator(`input[value="${PLACE}"]`)).toBeVisible();
  });

  test("préparer une tournée : un seul arrêt pour le haras partagé", async ({ page }) => {
    await page.goto(zone, { waitUntil: "networkidle" });
    await row(page, "DeuxLieuxE2E").getByRole("button").first().click({ modifiers: ["Control"] });
    await row(page, "HarasSeulE2E").getByRole("button").first().click({ modifiers: ["Control"] });
    await page.getByTestId("map-selection-bar").getByRole("button", { name: "Préparer une tournée" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("2 clients choisis : un arrêt par domicile ou par lieu");
    await dialog.getByLabel("Date").fill("2031-03-12");
    await dialog.getByLabel("Nom").fill(TOUR_NAME);
    await dialog.getByRole("button", { name: "Créer la journée" }).click();
    await page.waitForURL("**/dashboard/tournees?date=2031-03-12", { timeout: 20000 });

    const sql = neon(process.env.DATABASE_URL!);
    const stops = await sql`SELECT s.label, s.type FROM "TourStop" s JOIN "TourRun" r ON r.id = s."tourRunId" WHERE r.name = ${TOUR_NAME} ORDER BY s."order"`;
    expect(stops).toEqual([{ label: "Test DeuxLieuxE2E", type: "HOME" }, { label: PLACE, type: "STABLE" }]);
  });
});
