import { config } from "dotenv";
import { expect, test, type Page, type Route } from "@playwright/test";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.local" });

/**
 * Recherche unifiée et filtres de la carte clients — Phase 3 : le réglage du
 * rayon n'existe que quand un lieu est choisi, trois paliers (15/30/50 km)
 * avec compte par palier calculé localement, et une poignée glissable sur le
 * bord du cercle (absente sous 640px). Voir le prompt dédié.
 *
 * Le filtrage par périmètre porte sur TOUS les clients (y compris les
 * données de démonstration réelles de cette base de dev), donc les décomptes
 * absolus par palier ne sont pas fiables comme assertion — les tests
 * vérifient plutôt la VISIBILITÉ de clients de test placés à des distances
 * connues (10/25/45 km à l'est du centre), qui reste vraie quel que soit le
 * bruit environnant.
 */

const testEmail = "praticien-test@pf-osteo-animale.fr";
const testPassword = "Praticien-Test-2026!";

const ROUEN = { lat: 49.4432, lng: 1.0999 };

function destinationPointEast(origin: { lat: number; lng: number }, distanceKm: number) {
  const earthRadiusKm = 6371;
  const angular = distanceKm / earthRadiusKm;
  const bearing = Math.PI / 2;
  const lat1 = (origin.lat * Math.PI) / 180;
  const lng1 = (origin.lng * Math.PI) / 180;
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(angular) + Math.cos(lat1) * Math.sin(angular) * Math.cos(bearing));
  const lng2 = lng1 + Math.atan2(Math.sin(bearing) * Math.sin(angular) * Math.cos(lat1), Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2));
  return { lat: (lat2 * 180) / Math.PI, lng: (lng2 * 180) / Math.PI };
}

const nearPoint = destinationPointEast(ROUEN, 10); // dans les 3 paliers
const midPoint = destinationPointEast(ROUEN, 25); // dans 30 et 50 km seulement
const farPoint = destinationPointEast(ROUEN, 45); // dans 50 km seulement

const fixtures = [
  { suffix: "near", point: nearPoint, animalName: "NearPerimeterE2E" },
  { suffix: "mid", point: midPoint, animalName: "MidPerimeterE2E" },
  { suffix: "far", point: farPoint, animalName: "FarPerimeterE2E" },
] as const;

const MOCK_COMMUNES = [
  { nom: "Rouen", code: "76540", centre: { type: "Point", coordinates: [ROUEN.lng, ROUEN.lat] }, departement: { code: "76", nom: "Seine-Maritime" } },
];

async function mockPlaceSearch(page: Page) {
  await page.route("https://geo.api.gouv.fr/communes**", async (route: Route) => {
    const url = new URL(route.request().url());
    const matches = (url.searchParams.get("nom") ?? "").toLocaleLowerCase("fr-FR").includes("rouen");
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(matches ? MOCK_COMMUNES : []) });
  });
  await page.route("https://geo.api.gouv.fr/departements**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await page.route("https://geo.api.gouv.fr/regions**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
}

async function seed() {
  const sql = neon(process.env.DATABASE_URL!);
  for (const [index, fixture] of fixtures.entries()) {
    const clientId = `tmp-perimeter-client-${fixture.suffix}`;
    const animalId = `tmp-perimeter-animal-${fixture.suffix}`;
    const appointmentId = `tmp-perimeter-appt-${fixture.suffix}`;
    // Horaires distincts : l'index unique partiel (date, start) sur les
    // rendez-vous non annulés rejette sinon deux rendez-vous seedés à la
    // même minute.
    const start = `${9 + index}:00`;
    await sql`INSERT INTO "Client" (id, "firstName", "lastName", phone, email, city, address, "updatedAt") VALUES (${clientId}, 'Test', ${`Perimeter${fixture.suffix}E2E`}, '0600000005', ${`perimeter-${fixture.suffix}@example.fr`}, 'Test', '1 rue Test', now())`;
    await sql`INSERT INTO "Animal" (id, "clientId", name, species, breed, age, weight, sex, avatar, "avatarBackground", history, conditions, treatments, notes, "updatedAt") VALUES (${animalId}, ${clientId}, ${fixture.animalName}, 'Chien', '', '', '', '', '', '', '', '', '', '', now())`;
    await sql`
      INSERT INTO "Appointment" (id, "clientId", "animalId", "clientName", "animalName", "serviceName", date, start, duration, mode, location, latitude, longitude, price, status, notes, "createdAt", "updatedAt")
      VALUES (${appointmentId}, ${clientId}, ${animalId}, 'Test', ${fixture.animalName}, 'Ostéopathie E2E', '2031-06-05'::date, ${start}, 30, 'DOMICILE', 'Adresse test', ${fixture.point.lat}, ${fixture.point.lng}, 50, 'COMPLETED', '', now(), now())
    `;
  }
}

async function cleanup() {
  const sql = neon(process.env.DATABASE_URL!);
  for (const fixture of fixtures) {
    await sql`DELETE FROM "Appointment" WHERE id = ${`tmp-perimeter-appt-${fixture.suffix}`}`;
    await sql`DELETE FROM "Animal" WHERE id = ${`tmp-perimeter-animal-${fixture.suffix}`}`;
    await sql`DELETE FROM "Client" WHERE id = ${`tmp-perimeter-client-${fixture.suffix}`}`;
  }
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

async function openMap(page: Page) {
  await page.goto("/dashboard/tournees");
  await page.waitForTimeout(600);
  await page.getByRole("button", { name: "Carte clients" }).click();
}

async function selectRouenPerimeter(page: Page) {
  const search = page.getByPlaceholder("Rechercher un client, un animal ou un lieu");
  await search.fill("Rouen");
  const placesGroup = page.getByRole("group", { name: "Lieux · définir un périmètre" });
  const placeOption = placesGroup.getByRole("option", { name: /Rouen/ });
  await expect(placeOption).toBeVisible();
  await placeOption.click();
}

function perimeterTokenLocator(page: Page) {
  return page.locator('button[aria-haspopup="true"]').filter({ hasText: "autour de Rouen" });
}

function clientsListLocator(page: Page) {
  return page.getByRole("heading", { name: "Clients visibles" }).locator("xpath=../following-sibling::div[1]");
}

test.describe("Carte clients — périmètre par paliers et poignée (Phase 3)", () => {
  test.beforeEach(async () => {
    await cleanup();
    await seed();
    await clearLoginRateLimit();
  });

  test.afterEach(async () => {
    await cleanup();
  });

  test("aucun contrôle de rayon tant qu'aucun lieu n'est choisi ; sélectionner un lieu affiche le jeton et les paliers", async ({ page }) => {
    await mockPlaceSearch(page);
    await login(page);
    await openMap(page);

    await expect(perimeterTokenLocator(page)).toHaveCount(0);

    await selectRouenPerimeter(page);
    const token = perimeterTokenLocator(page);
    await expect(token).toBeVisible();
    await expect(token).toContainText("15 km autour de Rouen");

    await token.click();
    const panel = page.getByRole("group", { name: "Choisir le rayon du périmètre" });
    await expect(panel).toBeVisible();
    for (const km of [15, 30, 50]) {
      await expect(panel.getByRole("button", { name: new RegExp(`^${km} km`) })).toBeVisible();
    }
  });

  test("changer de palier met à jour la carte et le compteur (visibilité des clients de test à distance connue)", async ({ page }) => {
    await mockPlaceSearch(page);
    await login(page);
    await openMap(page);
    await selectRouenPerimeter(page);

    const clientsList = clientsListLocator(page);
    const token = perimeterTokenLocator(page);

    // Palier par défaut (15 km) : seul le client "près" (10 km) est visible.
    await expect(clientsList.getByText("NearPerimeterE2E")).toBeVisible();
    await expect(clientsList.getByText("MidPerimeterE2E")).toHaveCount(0);
    await expect(clientsList.getByText("FarPerimeterE2E")).toHaveCount(0);

    await token.click();
    await page.getByRole("group", { name: "Choisir le rayon du périmètre" }).getByRole("button", { name: /^30 km/ }).click();
    await expect(token).toContainText("30 km autour de Rouen");
    await expect(clientsList.getByText("NearPerimeterE2E")).toBeVisible();
    await expect(clientsList.getByText("MidPerimeterE2E")).toBeVisible();
    await expect(clientsList.getByText("FarPerimeterE2E")).toHaveCount(0);

    await token.click();
    await page.getByRole("group", { name: "Choisir le rayon du périmètre" }).getByRole("button", { name: /^50 km/ }).click();
    await expect(token).toContainText("50 km autour de Rouen");
    await expect(clientsList.getByText("NearPerimeterE2E")).toBeVisible();
    await expect(clientsList.getByText("MidPerimeterE2E")).toBeVisible();
    await expect(clientsList.getByText("FarPerimeterE2E")).toBeVisible();
  });

  test("glisser la poignée met à jour le rayon en direct sans jamais rappeler la recherche de lieu, et arrondit à 5 km au relâchement", async ({ page }) => {
    await mockPlaceSearch(page);
    let placeRequestCount = 0;
    page.on("request", (request) => { if (request.url().includes("geo.api.gouv.fr")) placeRequestCount += 1; });

    await login(page);
    await openMap(page);
    await selectRouenPerimeter(page);

    const requestsAfterSelect = placeRequestCount;
    const handle = page.locator('span[style*="ew-resize"]');
    await expect(handle).toBeVisible();
    const box = await handle.boundingBox();
    expect(box).not.toBeNull();
    const startX = box!.x + box!.width / 2;
    const startY = box!.y + box!.height / 2;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 60, startY, { steps: 8 });
    await page.mouse.up();

    // Le glisser (recherche locale uniquement, voir clientsInPerimeter) n'a
    // provoqué aucun nouvel appel à la recherche de lieu.
    expect(placeRequestCount).toBe(requestsAfterSelect);

    const token = perimeterTokenLocator(page);
    await expect(token).toBeVisible();
    const label = (await token.textContent()) ?? "";
    const match = label.match(/(\d+) km autour de Rouen/);
    expect(match).not.toBeNull();
    const committedKm = Number(match![1]);
    expect(committedKm % 5).toBe(0);
    expect(committedKm).toBeGreaterThan(0);
  });

  test("sous 640px, la poignée est absente et les paliers restent utilisables", async ({ page }) => {
    await page.setViewportSize({ width: 500, height: 900 });
    await mockPlaceSearch(page);
    await login(page);
    await openMap(page);
    await selectRouenPerimeter(page);

    await expect(page.locator('span[style*="ew-resize"]')).toHaveCount(0);

    const token = perimeterTokenLocator(page);
    await token.click();
    const panel = page.getByRole("group", { name: "Choisir le rayon du périmètre" });
    await expect(panel).toBeVisible();
    await panel.getByRole("button", { name: /^50 km/ }).click();
    await expect(token).toContainText("50 km autour de Rouen");
    await expect(clientsListLocator(page).getByText("FarPerimeterE2E")).toBeVisible();
  });
});
