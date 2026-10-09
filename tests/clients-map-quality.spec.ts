import { config } from "dotenv";
import { expect, test, type Page } from "./helpers/test";
import { neon } from "./helpers/sql";

config({ path: ".env.local" });

/**
 * Carte clients, phase 8.7 : qualité des positions — indicateur « N %
 * fiable », détail par catégorie (filtrable), couleur « Qualité des
 * positions » doublée d'un libellé. « Localiser » n'est jamais cliqué ici :
 * il géocoderait les vrais clients de la base.
 */

const testEmail = "praticien-test@pf-osteo-animale.fr";
const testPassword = "Praticien-Test-2026!";

// Zone vide de clients de démonstration (Perche normand).
const fixtures = [
  { suffix: "p", lastName: "QualPreciseE2E", point: { lat: 48.9, lng: 0.2 }, precision: "EXACT" },
  { suffix: "a", lastName: "QualApproxE2E", point: { lat: 48.93, lng: 0.2 }, precision: "CITY" },
  { suffix: "u", lastName: "QualInconnuE2E", point: null, precision: null },
] as const;

async function cleanup() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`DELETE FROM "Animal" WHERE id LIKE 'tmp-quality-animal-%'`;
  await sql`DELETE FROM "Client" WHERE id LIKE 'tmp-quality-client-%'`;
}

async function seed() {
  const sql = neon(process.env.DATABASE_URL!);
  for (const fixture of fixtures) {
    const clientId = `tmp-quality-client-${fixture.suffix}`;
    await sql`INSERT INTO "Client" (id, "firstName", "lastName", phone, email, city, address, latitude, longitude, "geocodePrecision", "geocodedAt", "updatedAt") VALUES (${clientId}, 'Test', ${fixture.lastName}, '0600000061', ${`quality-${fixture.suffix}@example.fr`}, 'Commune test', '1 rue Test', ${fixture.point?.lat ?? null}, ${fixture.point?.lng ?? null}, ${fixture.precision}, now(), now())`;
    await sql`INSERT INTO "Animal" (id, "clientId", name, species, breed, age, weight, sex, avatar, "avatarBackground", history, conditions, treatments, notes, "updatedAt") VALUES (${`tmp-quality-animal-${fixture.suffix}`}, ${clientId}, ${`Pet${fixture.suffix}QualE2E`}, 'Chien', '', '', '', '', '', '', '', '', '', '', now())`;
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
const marker = (page: Page, lastName: string) => page.locator(`.leaflet-marker-icon[title*="${lastName}"]`);

test.describe("Carte clients — qualité des positions", () => {
  test.beforeAll(async () => { await cleanup(); await seed(); });
  test.afterAll(cleanup);

  test("indicateur, détail filtrable, couleur par qualité", async ({ page }) => {
    await login(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/dashboard/carte?lieu=48.91500,0.20000&nom=Test&rayon=5", { waitUntil: "networkidle" });

    const indicator = page.getByRole("button", { name: /^Localisation : \d+ % fiable$/ });
    await expect(indicator).toBeVisible();
    await indicator.click();
    const detail = page.getByRole("group", { name: "Qualité des positions" });
    await expect(detail).toContainText(/\d+ précises?/);
    await expect(detail).toContainText(/\d+ approximatives?/);
    await expect(detail).toContainText(/\d+ inconnues?/);
    await expect(detail.getByRole("button", { name: /Localiser les \d+ sans position/ })).toBeVisible();

    // « Voir » les approximatives : seul le client trouvé à la commune reste.
    await detail.getByRole("button", { name: /approximatives?/ }).click();
    await expect(page.getByRole("button", { name: /^Positions approximatives/ })).toBeVisible();
    await expect(row(page, "QualApproxE2E")).toContainText("Position approximative");
    await expect(row(page, "QualPreciseE2E")).toHaveCount(0);
    await page.getByRole("button", { name: /^Positions approximatives/ }).click();
    await expect(row(page, "QualPreciseE2E")).toBeVisible();

    await indicator.click();
    await page.getByRole("group", { name: "Qualité des positions" }).getByRole("button", { name: "Colorer par qualité" }).click();
    await expect(page.getByLabel("Couleur")).toHaveValue("quality");
    await expect(marker(page, "QualPreciseE2E")).toHaveAttribute("title", /position précise/);
    await expect(marker(page, "QualApproxE2E")).toHaveAttribute("title", /position approximative/);
    await expect(page.getByText("Approximative (contour en pointillés)")).toBeVisible();
  });
});
