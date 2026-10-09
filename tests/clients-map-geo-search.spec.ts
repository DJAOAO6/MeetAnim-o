import { config } from "dotenv";
import { expect, test, type Page, type Route } from "./helpers/test";
import { neon } from "./helpers/sql";

config({ path: ".env.local" });

/**
 * Carte clients, phase 4 : ce qu'on cherche se voit exactement.
 *  - un rayon est toujours entièrement cadré (15 → 50 km dézoome, 50 → 15 rezoome) ;
 *  - un département filtre sur son vrai territoire, sans cercle ni paliers ;
 *  - une adresse pose une épingle et un cercle ;
 *  - retirer le périmètre efface cercle, épingle, contour et filtre.
 * Les services externes (lieux, adresses, contours) sont simulés.
 */

const testEmail = "praticien-test@pf-osteo-animale.fr";
const testPassword = "Praticien-Test-2026!";
const ROUEN = { lat: 49.4432, lng: 1.0999 };

function eastOf(origin: { lat: number; lng: number }, km: number) {
  const angular = km / 6371;
  const lat1 = (origin.lat * Math.PI) / 180;
  const lng1 = (origin.lng * Math.PI) / 180;
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(angular) + Math.cos(lat1) * Math.sin(angular) * Math.cos(Math.PI / 2));
  const lng2 = lng1 + Math.atan2(Math.sin(Math.PI / 2) * Math.sin(angular) * Math.cos(lat1), Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2));
  return { lat: (lat2 * 180) / Math.PI, lng: (lng2 * 180) / Math.PI };
}

const fixtures = [
  { suffix: "in", lastName: "GeoInsideE2E", point: eastOf(ROUEN, 10) },
  { suffix: "out", lastName: "GeoOutsideE2E", point: eastOf(ROUEN, 45) },
] as const;

// « Département » simulé : un rectangle qui contient le client à 10 km et
// exclut celui à 45 km.
const DEPARTEMENT = {
  geometry: { type: "Polygon", coordinates: [[[0.9, 49.3], [1.4, 49.3], [1.4, 49.6], [0.9, 49.6], [0.9, 49.3]]] },
  bounds: { south: 49.3, west: 0.9, north: 49.6, east: 1.4 },
};
const COMMUNE = {
  geometry: { type: "Polygon", coordinates: [[[1.05, 49.42], [1.15, 49.42], [1.15, 49.47], [1.05, 49.47], [1.05, 49.42]]] },
  bounds: { south: 49.42, west: 1.05, north: 49.47, east: 1.15 },
};
const ADDRESS = { id: "addr-e2e", label: "12 Rue de la République 76000 Rouen", houseNumber: "12", street: "Rue de la République", postcode: "76000", city: "Rouen", latitude: ROUEN.lat, longitude: ROUEN.lng };

async function mockServices(page: Page) {
  await page.route("https://geo.api.gouv.fr/communes?**", (route: Route) => {
    const name = new URL(route.request().url()).searchParams.get("nom") ?? "";
    const body = name.toLocaleLowerCase("fr-FR").includes("rouen")
      ? [{ nom: "Rouen", code: "76540", centre: { type: "Point", coordinates: [ROUEN.lng, ROUEN.lat] }, departement: { code: "76", nom: "Seine-Maritime" }, codesPostaux: ["76000"] }]
      : [];
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.route("https://geo.api.gouv.fr/communes/76540?**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ nom: "Rouen", centre: { type: "Point", coordinates: [ROUEN.lng, ROUEN.lat] } }) }));
  await page.route("https://geo.api.gouv.fr/departements?**", (route) => {
    const name = new URL(route.request().url()).searchParams.get("nom") ?? "";
    const body = name.toLocaleLowerCase("fr-FR").includes("seine") ? [{ nom: "Seine-Maritime", code: "76", chefLieu: "76540" }] : [];
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.route("https://geo.api.gouv.fr/regions?**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await page.route("**/api/territory?**", (route) => {
    const type = new URL(route.request().url()).searchParams.get("type");
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(type === "commune" ? COMMUNE : DEPARTEMENT) });
  });
  await page.route("**/api/address-search?**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ results: [ADDRESS] }) }));
}

async function seed() {
  const sql = neon(process.env.DATABASE_URL!);
  for (const [index, fixture] of fixtures.entries()) {
    const clientId = `tmp-geo-client-${fixture.suffix}`;
    const animalId = `tmp-geo-animal-${fixture.suffix}`;
    await sql`INSERT INTO "Client" (id, "firstName", "lastName", phone, email, city, address, "updatedAt") VALUES (${clientId}, 'Test', ${fixture.lastName}, '0600000009', ${`geo-${fixture.suffix}@example.fr`}, 'Rouen', '1 rue Test', now())`;
    await sql`INSERT INTO "Animal" (id, "clientId", name, species, breed, age, weight, sex, avatar, "avatarBackground", history, conditions, treatments, notes, "updatedAt") VALUES (${animalId}, ${clientId}, ${`Geo${fixture.suffix}Pet`}, 'Chien', '', '', '', '', '', '', '', '', '', '', now())`;
    await sql`
      INSERT INTO "Appointment" (id, "clientId", "animalId", "clientName", "animalName", "serviceName", date, start, duration, mode, location, latitude, longitude, price, status, notes, "createdAt", "updatedAt")
      VALUES (${`tmp-geo-appt-${fixture.suffix}`}, ${clientId}, ${animalId}, 'Test', ${`Geo${fixture.suffix}Pet`}, 'Ostéopathie E2E', '2031-06-05'::date, ${`${10 + index}:00`}, 30, 'DOMICILE', 'Adresse test', ${fixture.point.lat}, ${fixture.point.lng}, 50, 'COMPLETED', '', now(), now())
    `;
  }
}

async function cleanup() {
  const sql = neon(process.env.DATABASE_URL!);
  for (const fixture of fixtures) {
    await sql`DELETE FROM "Appointment" WHERE id = ${`tmp-geo-appt-${fixture.suffix}`}`;
    await sql`DELETE FROM "Animal" WHERE id = ${`tmp-geo-animal-${fixture.suffix}`}`;
    await sql`DELETE FROM "Client" WHERE id = ${`tmp-geo-client-${fixture.suffix}`}`;
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

const search = (page: Page) => page.getByPlaceholder("Rechercher un client, un animal ou un lieu");
const list = (page: Page) => page.getByTestId("map-client-list");

/** Le cercle du périmètre est-il entièrement dans la carte ? Et sa taille à l'écran. */
async function circleOnScreen(page: Page) {
  await page.waitForTimeout(900); // fin du recadrage animé
  const container = (await page.locator(".leaflet-container").boundingBox())!;
  const circle = (await page.locator("path.map-perimeter").boundingBox())!;
  const inside = circle.x >= container.x - 1 && circle.y >= container.y - 1 && circle.x + circle.width <= container.x + container.width + 1 && circle.y + circle.height <= container.y + container.height + 1;
  return { inside, width: circle.width };
}

test.describe("Carte clients — recherche géographique et périmètres", () => {
  test.describe.configure({ mode: "serial" });
  test.beforeAll(async () => { await cleanup(); await seed(); });
  test.afterAll(cleanup);
  test.beforeEach(async ({ page }) => {
    await mockServices(page);
    await login(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/dashboard/carte", { waitUntil: "networkidle" });
  });

  test("le rayon est toujours entièrement cadré : 15 → 50 dézoome, 50 → 15 rezoome", async ({ page }) => {
    await search(page).fill("Rouen");
    await page.getByRole("group", { name: "Lieux · définir un périmètre" }).getByRole("option", { name: /Rouen/ }).click();
    const at15 = await circleOnScreen(page);
    expect(at15.inside, "15 km : tout le cercle est visible").toBe(true);
    await expect(page.locator("path.map-territory"), "le contour de la commune s'affiche").toHaveCount(1);

    await page.getByRole("button", { name: /km autour de Rouen/ }).click();
    await page.getByRole("button", { name: /^50 km/ }).click();
    const at50 = await circleOnScreen(page);
    expect(at50.inside, "50 km : la carte a dézoomé jusqu'à tout voir").toBe(true);

    await page.getByRole("button", { name: /km autour de Rouen/ }).click();
    await page.getByRole("button", { name: /^15 km/ }).click();
    const back = await circleOnScreen(page);
    expect(back.inside).toBe(true);
    // Même cadrage qu'au départ : la carte a bien rezoomé (le zoom de Leaflet
    // se fait par niveaux entiers, d'où la comparaison avec le départ).
    expect(Math.abs(back.width - at15.width), "retour à 15 km : même cadrage qu'au départ").toBeLessThan(at15.width * 0.05);
    // Et à 50 km, un cercle de 15 km aurait été bien plus petit : la carte avait dézoomé.
    expect(at50.width * (15 / 50)).toBeLessThan(at15.width * 0.75);
  });

  test("un département filtre sur son territoire, sans cercle ni paliers", async ({ page }) => {
    await search(page).fill("Seine");
    await page.getByRole("group", { name: "Lieux · définir un périmètre" }).getByRole("option", { name: /Seine-Maritime/ }).click();
    await expect(page.getByText("Département · Seine-Maritime")).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: "dans le territoire Seine-Maritime" })).toBeVisible();
    await expect(page.locator("path.map-territory")).toHaveCount(1);
    await expect(page.locator("path.map-perimeter"), "pas de cercle kilométrique").toHaveCount(0);
    await expect(page.getByRole("button", { name: /km autour de/ }), "pas de paliers").toHaveCount(0);

    await expect(list(page).getByText("Test GeoInsideE2E")).toBeVisible();
    await expect(list(page).getByText("Test GeoOutsideE2E"), "hors du territoire : absent de la liste").toHaveCount(0);
    await expect(page.locator('.leaflet-marker-icon[title*="GeoOutsideE2E"][title*="hors du périmètre"]'), "mais gardé, atténué, sur la carte").toHaveCount(1);
  });

  test("une adresse pose une épingle et un cercle ; retirer le périmètre efface tout", async ({ page }) => {
    await search(page).fill("12 rue de la République");
    await page.getByRole("group", { name: "Adresses" }).getByRole("option").first().click();
    await expect(page.locator(`.leaflet-marker-icon[title="${ADDRESS.label}"]`), "l'épingle de l'adresse").toHaveCount(1);
    await expect(page.locator("path.map-perimeter")).toHaveCount(1);
    await expect(page.getByRole("button", { name: `15 km autour de ${ADDRESS.label}` })).toBeVisible();

    await page.getByRole("button", { name: "Retirer le filtre de périmètre" }).click();
    await expect(page.locator("path.map-perimeter")).toHaveCount(0);
    await expect(page.locator(`.leaflet-marker-icon[title="${ADDRESS.label}"]`)).toHaveCount(0);
    await expect(list(page).getByText("Test GeoOutsideE2E")).toBeVisible();
    await expect(page.locator('.leaflet-marker-icon[title*="hors du périmètre"]')).toHaveCount(0);
  });
});
