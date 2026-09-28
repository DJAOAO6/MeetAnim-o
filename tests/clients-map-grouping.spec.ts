import { config } from "dotenv";
import { expect, test, type Page } from "@playwright/test";
import { neon } from "./helpers/sql";

config({ path: ".env.local" });

/**
 * Carte clients, phase 5 : un client = une ligne (ses animaux regroupés),
 * marqueurs regroupés selon le zoom, jamais de marqueur irrécupérable (les
 * clients à la même adresse se déploient en éventail), molette qui ne
 * capture plus le défilement de la page, fiche sous la carte sur téléphone.
 */

const testEmail = "praticien-test@pf-osteo-animale.fr";
const testPassword = "Praticien-Test-2026!";
// Trois clients à la même adresse, loin des autres clients de la base.
const STACK = { lat: 49.62, lng: 1.62 };
const FAMILY = { lat: 49.597, lng: 1.742 };

const clients = [
  { id: "tmp-group-family", lastName: "FamilleE2E", point: FAMILY, animals: [["tmp-group-pet-1", "OscarE2E", "Chien"], ["tmp-group-pet-2", "NalaE2E", "Chat"]] },
  { id: "tmp-group-stack-1", lastName: "PileUnE2E", point: STACK, animals: [["tmp-group-pet-3", "PileUnPet", "Chien"]] },
  { id: "tmp-group-stack-2", lastName: "PileDeuxE2E", point: STACK, animals: [["tmp-group-pet-4", "PileDeuxPet", "Chien"]] },
  { id: "tmp-group-stack-3", lastName: "PileTroisE2E", point: STACK, animals: [["tmp-group-pet-5", "PileTroisPet", "Chien"]] },
] as const;

async function seed() {
  const sql = neon(process.env.DATABASE_URL!);
  for (const client of clients) {
    // Position de la fiche client (décision A : l'adresse d'abord).
    await sql`INSERT INTO "Client" (id, "firstName", "lastName", phone, email, city, address, latitude, longitude, "updatedAt") VALUES (${client.id}, 'Test', ${client.lastName}, '0600000010', ${`${client.id}@example.fr`}, 'Dieppe', '1 rue Test', ${client.point.lat}, ${client.point.lng}, now())`;
    for (const [animalId, name, species] of client.animals) {
      await sql`INSERT INTO "Animal" (id, "clientId", name, species, breed, age, weight, sex, avatar, "avatarBackground", history, conditions, treatments, notes, "updatedAt") VALUES (${animalId}, ${client.id}, ${name}, ${species}, '', '', '', '', '', '', '', '', '', '', now())`;
    }
  }
}

async function cleanup() {
  const sql = neon(process.env.DATABASE_URL!);
  for (const client of clients) {
    await sql`DELETE FROM "Animal" WHERE "clientId" = ${client.id}`;
    await sql`DELETE FROM "Client" WHERE id = ${client.id}`;
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

const row = (page: Page, id: string) => page.locator(`[data-client-row="${id}"]`);

test.describe("Carte clients — regroupement et affichage", () => {
  test.describe.configure({ mode: "serial" });
  test.beforeAll(async () => { await cleanup(); await seed(); });
  test.afterAll(cleanup);
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/dashboard/carte", { waitUntil: "networkidle" });
    await expect(row(page, "tmp-group-family")).toBeVisible({ timeout: 15000 });
  });

  test("un client = une ligne, ses animaux regroupés ; le compteur distingue clients et animaux", async ({ page }) => {
    await expect(row(page, "tmp-group-family")).toHaveCount(1);
    await expect(row(page, "tmp-group-family")).toContainText("NalaE2E · Chat, OscarE2E · Chien");
    await expect(page.getByText(/^\d+ clients? · \d+ anima(l|ux)$/)).toBeVisible();

    await row(page, "tmp-group-family").getByRole("button").first().click();
    const card = page.getByRole("button", { name: "Fermer la fiche de Test FamilleE2E" }).locator("xpath=ancestor::div[contains(@class,'rounded-2xl')][1]");
    await expect(card).toContainText("OscarE2E");
    await expect(card).toContainText("NalaE2E");
    await expect(card).toContainText("Adresse du client");
  });

  test("des clients à la même adresse se regroupent, puis se déploient en éventail", async ({ page }) => {
    // Zoom sur la pile (choisir un de ses clients), puis refermer la fiche :
    // le groupe revient, et ne peut plus se séparer en zoomant.
    await row(page, "tmp-group-stack-1").getByRole("button").first().click();
    await page.waitForTimeout(900);
    await page.keyboard.press("Escape");
    const cluster = page.locator('.leaflet-marker-icon[title="3 clients ici — afficher le détail"]');
    await expect(cluster).toBeVisible();
    await expect(page.locator('.leaflet-marker-icon[title*="PileUnE2E"]'), "regroupés, pas empilés").toHaveCount(0);

    await cluster.click();
    for (const name of ["PileUnE2E", "PileDeuxE2E", "PileTroisE2E"]) {
      await expect(page.locator(`.leaflet-marker-icon[title*="${name}"]`), `${name} accessible`).toBeVisible();
    }
    await expect(page.locator("path.map-spider-leg")).toHaveCount(3);
    await page.locator('.leaflet-marker-icon[title*="PileDeuxE2E"]').click();
    await expect(row(page, "tmp-group-stack-2").locator("[aria-current='true']")).toBeVisible();
  });

  test("la molette fait défiler la page tant qu'on n'a pas cliqué sur la carte", async ({ page }) => {
    const map = page.locator(".leaflet-container");
    await map.scrollIntoViewIfNeeded();
    const box = (await map.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    const before = await page.evaluate(() => window.scrollY);
    await page.mouse.wheel(0, 300);
    await expect.poll(() => page.evaluate(() => window.scrollY), { message: "la page défile" }).toBeGreaterThan(before);
    await expect(page.getByText("Cliquez sur la carte pour zoomer à la molette")).toBeVisible();
  });

  test("sur téléphone, la fiche se range sous la carte au lieu de la recouvrir", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await row(page, "tmp-group-family").getByRole("button").first().click();
    const close = page.getByRole("button", { name: "Fermer la fiche de Test FamilleE2E" });
    await expect(close).toBeVisible();
    const mapBox = (await page.locator(".leaflet-container").boundingBox())!;
    const closeBox = (await close.boundingBox())!;
    expect(closeBox.y, "la fiche commence sous la carte").toBeGreaterThan(mapBox.y + mapBox.height);
    await expect(page.getByRole("button", { name: /Afficher ma position/ })).not.toContainText("📍");
  });
});
