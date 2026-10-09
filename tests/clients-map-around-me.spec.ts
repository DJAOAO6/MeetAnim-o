import { config } from "dotenv";
import { expect, test, type Page } from "./helpers/test";
import { neon } from "./helpers/sql";

config({ path: ".env.local" });

/**
 * Carte clients, phase 8.2 : « Autour de moi » — la position de l'appareil
 * (demandée une fois, à un geste), un rayon court, les clients du plus
 * proche au plus éloigné avec leurs actions ; un refus d'autorisation est
 * expliqué, jamais un message brut du navigateur.
 */

const testEmail = "praticien-test@pf-osteo-animale.fr";
const testPassword = "Praticien-Test-2026!";

// Zone vide de clients de démonstration (pays de Caux).
const ME = { latitude: 49.55, longitude: 0.55 };
const fixtures = [
  { suffix: "near", lastName: "ProcheE2E", point: { lat: 49.57, lng: 0.55 } }, // ≈ 2,2 km
  { suffix: "mid", lastName: "MoyenE2E", point: { lat: 49.622, lng: 0.55 } }, // ≈ 8 km
  { suffix: "far", lastName: "LoinE2E", point: { lat: 49.73, lng: 0.55 } }, // ≈ 20 km
] as const;

async function cleanup() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`DELETE FROM "Animal" WHERE id LIKE 'tmp-around-animal-%'`;
  await sql`DELETE FROM "Client" WHERE id LIKE 'tmp-around-client-%'`;
}

async function seed() {
  const sql = neon(process.env.DATABASE_URL!);
  for (const fixture of fixtures) {
    await sql`INSERT INTO "Client" (id, "firstName", "lastName", phone, email, city, address, latitude, longitude, "geocodePrecision", "updatedAt") VALUES (${`tmp-around-client-${fixture.suffix}`}, 'Test', ${fixture.lastName}, '06 00 00 00 41', ${`around-${fixture.suffix}@example.fr`}, 'Commune test', '1 rue Test', ${fixture.point.lat}, ${fixture.point.lng}, 'EXACT', now())`;
    await sql`INSERT INTO "Animal" (id, "clientId", name, species, breed, age, weight, sex, avatar, "avatarBackground", history, conditions, treatments, notes, "updatedAt") VALUES (${`tmp-around-animal-${fixture.suffix}`}, ${`tmp-around-client-${fixture.suffix}`}, ${`Pet${fixture.suffix}AroundE2E`}, 'Chien', '', '', '', '', '', '', '', '', '', '', now())`;
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

const rows = (page: Page) => page.getByTestId("map-client-list").locator("[data-client-row]");
const row = (page: Page, lastName: string) => page.locator("[data-client-row]").filter({ hasText: lastName });

test.describe("Carte clients — autour de moi", () => {
  test.describe.configure({ mode: "serial" });
  test.beforeAll(async () => { await cleanup(); await seed(); });
  test.afterAll(cleanup);

  test.describe("position autorisée", () => {
    test.use({ geolocation: ME, permissions: ["geolocation"] });

    test("clients proches, du plus proche au plus éloigné, avec leurs actions", async ({ page }) => {
      await login(page);
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto("/dashboard/carte", { waitUntil: "networkidle" });
      await page.getByRole("button", { name: "Autour de moi" }).click();

      await expect(page.getByText(/2 clients à moins de 10 km de vous/)).toBeVisible();
      await expect(rows(page).first()).toContainText("ProcheE2E");
      await expect(rows(page).first()).toContainText("2,2 km");
      await expect(rows(page).nth(1)).toContainText("MoyenE2E");
      await expect(row(page, "LoinE2E")).toHaveCount(0);

      const actions = page.getByRole("group", { name: "Actions pour Test ProcheE2E" });
      await expect(actions.getByRole("link", { name: "Appeler" })).toHaveAttribute("href", "tel:+33600000041");
      await expect(actions.getByRole("link", { name: "Fiche" })).toHaveAttribute("href", "/dashboard/clients/tmp-around-client-near");
      await expect(actions.getByRole("link", { name: "Itinéraire" })).toHaveAttribute("href", /destination=49\.57,0\.55/);
      await expect(actions.getByRole("button", { name: "RDV" })).toBeVisible();
      await expect(page.locator('.leaflet-marker-icon[title="Ma position"]')).toBeAttached();

      // Rayons courts : 5 km ne garde que le plus proche.
      await page.getByRole("button", { name: "10 km autour de vous" }).click();
      await page.getByRole("group", { name: "Choisir le rayon du périmètre" }).getByRole("button", { name: /^5 km/ }).click();
      await expect(page.getByText(/1 client à moins de 5 km de vous/)).toBeVisible();

      await expect(page.getByRole("button", { name: "Recentrer sur moi" })).toBeVisible();
      // La position de l'appareil n'est jamais écrite dans l'adresse.
      await page.waitForTimeout(500);
      expect(page.url()).not.toContain("lieu=");

      await page.getByRole("button", { name: "Retirer le filtre de périmètre" }).click();
      await expect(page.getByRole("button", { name: "Autour de moi" })).toBeVisible();
      await expect(page.locator('.leaflet-marker-icon[title="Ma position"]')).toHaveCount(0);
    });
  });

  test("position refusée : message clair, sans jargon du navigateur", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "geolocation", {
        configurable: true,
        value: {
          getCurrentPosition: (_success: unknown, error: (err: { code: number; PERMISSION_DENIED: number; message: string }) => void) =>
            setTimeout(() => error({ code: 1, PERMISSION_DENIED: 1, message: "User denied Geolocation" }), 50),
          watchPosition: () => 0,
          clearWatch: () => undefined,
        },
      });
    });
    await login(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/dashboard/carte", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Autour de moi" }).click();
    const alert = page.getByRole("alert").filter({ hasText: "Position non disponible" });
    await expect(alert).toContainText("Autorisez la localisation pour afficher les clients proches de vous.");
    await expect(alert).not.toContainText("User denied");
  });
});
