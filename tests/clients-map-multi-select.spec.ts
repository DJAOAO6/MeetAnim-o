import { config } from "dotenv";
import { expect, test, type Page } from "@playwright/test";
import { neon } from "./helpers/sql";

config({ path: ".env.local" });

/**
 * Carte clients, phase 8.5 : sélection de plusieurs clients — Ctrl + clic,
 * rectangle tracé sur la carte, mode sélection au doigt — puis actions
 * groupées réelles (préparer une journée de tournée, envoyer les rappels).
 */

const testEmail = "praticien-test@pf-osteo-animale.fr";
const testPassword = "Praticien-Test-2026!";
const TOUR_NAME = "Tournée E2E Sélection";
const TOUR_DATE = "2031-03-11";

// Zone vide de clients de démonstration (pays d'Auge), points espacés d'environ 1,3 km.
const fixtures = [
  { suffix: "a", lastName: "SelUnE2E", point: { lat: 49.15, lng: 0.3 }, due: true },
  { suffix: "b", lastName: "SelDeuxE2E", point: { lat: 49.162, lng: 0.3 }, due: false },
  { suffix: "c", lastName: "SelTroisE2E", point: { lat: 49.15, lng: 0.318 }, due: false },
] as const;

async function cleanup() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`DELETE FROM "TourStop" WHERE "tourRunId" IN (SELECT id FROM "TourRun" WHERE name = ${TOUR_NAME})`;
  await sql`DELETE FROM "TourRun" WHERE name = ${TOUR_NAME}`;
  await sql`DELETE FROM "Reminder" WHERE id LIKE 'tmp-multi-reminder-%'`;
  await sql`DELETE FROM "Animal" WHERE id LIKE 'tmp-multi-animal-%'`;
  await sql`DELETE FROM "Client" WHERE id LIKE 'tmp-multi-client-%'`;
}

async function seed() {
  const sql = neon(process.env.DATABASE_URL!);
  for (const fixture of fixtures) {
    const clientId = `tmp-multi-client-${fixture.suffix}`;
    const animalId = `tmp-multi-animal-${fixture.suffix}`;
    await sql`INSERT INTO "Client" (id, "firstName", "lastName", phone, email, city, address, "postalCode", latitude, longitude, "geocodePrecision", "updatedAt") VALUES (${clientId}, 'Test', ${fixture.lastName}, '0600000051', ${`multi-${fixture.suffix}@example.fr`}, 'Lisieux', '1 rue Test', '14100', ${fixture.point.lat}, ${fixture.point.lng}, 'EXACT', now())`;
    await sql`INSERT INTO "Animal" (id, "clientId", name, species, breed, age, weight, sex, avatar, "avatarBackground", history, conditions, treatments, notes, "updatedAt") VALUES (${animalId}, ${clientId}, ${`Pet${fixture.suffix}MultiE2E`}, 'Chien', '', '', '', '', '', '', '', '', '', '', now())`;
    if (fixture.due) {
      await sql`INSERT INTO "Reminder" (id, "clientId", "animalId", "lastConsultation", delay, "dueDate", status, "updatedAt") VALUES (${`tmp-multi-reminder-${fixture.suffix}`}, ${clientId}, ${animalId}, now() - interval '7 months', 'SIX_MONTHS', now() - interval '1 month', 'DUE', now())`;
    }
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
const bar = (page: Page) => page.getByTestId("map-selection-bar");

/** Recadre la carte sur les trois clients (lieu dans l'adresse). */
async function openOnFixtures(page: Page) {
  await page.goto("/dashboard/carte?lieu=49.15500,0.30800&nom=Test&rayon=5", { waitUntil: "networkidle" });
  await expect(marker(page, "SelUnE2E")).toBeVisible({ timeout: 15000 });
  await expect(marker(page, "SelTroisE2E")).toBeVisible();
}

test.describe("Carte clients — sélection multiple", () => {
  test.describe.configure({ mode: "serial" });
  test.beforeAll(async () => { await cleanup(); await seed(); });
  test.afterAll(cleanup);
  test.beforeEach(async ({ page }) => { await login(page); });

  test("Ctrl + clic ajoute à la sélection, sans ouvrir de fiche", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openOnFixtures(page);
    await marker(page, "SelUnE2E").click({ modifiers: ["Control"] });
    await row(page, "SelDeuxE2E").getByRole("button").first().click({ modifiers: ["Control"] });
    await expect(bar(page)).toContainText("2 clients sélectionnés");
    await expect(page.getByRole("link", { name: "Voir la fiche client" }), "aucune fiche ouverte").toHaveCount(0);
    await expect(row(page, "SelUnE2E").getByRole("img", { name: "Dans la sélection" })).toBeVisible();

    // Un client à relancer dans la sélection : l'envoi groupé est proposé, avec confirmation.
    await bar(page).getByRole("button", { name: "Envoyer les rappels (1)" }).click();
    await expect(page.getByRole("dialog")).toContainText("Envoyer 1 rappel ?");
    await page.getByRole("dialog").getByRole("button", { name: "Annuler" }).click();

    await marker(page, "SelUnE2E").click({ modifiers: ["Control"] });
    await expect(bar(page)).toContainText("1 client sélectionné");
    await bar(page).getByRole("button", { name: "Tout désélectionner" }).click();
    await expect(bar(page)).toHaveCount(0);
  });

  test("tracer un rectangle sélectionne les clients qu'il contient, puis prépare une journée", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openOnFixtures(page);
    await page.getByRole("button", { name: "Outils de carte" }).click();
    await page.getByRole("button", { name: "Sélectionner une zone" }).click();
    await expect(page.getByText("Tracez un rectangle sur la carte")).toBeVisible();

    // Carte à l'écran : la souris ne trace que dans la fenêtre.
    await page.locator(".leaflet-container").evaluate((element) => element.scrollIntoView({ block: "center" }));
    const boxes = await Promise.all(["SelUnE2E", "SelDeuxE2E", "SelTroisE2E"].map(async (name) => (await marker(page, name).boundingBox())!));
    const left = Math.min(...boxes.map((box) => box.x)) - 20;
    const top = Math.min(...boxes.map((box) => box.y)) - 20;
    const right = Math.max(...boxes.map((box) => box.x + box.width)) + 20;
    const bottom = Math.max(...boxes.map((box) => box.y + box.height)) + 20;
    await page.mouse.move(left, top);
    await page.mouse.down();
    await page.mouse.move((left + right) / 2, (top + bottom) / 2, { steps: 5 });
    await page.mouse.move(right, bottom, { steps: 5 });
    await page.mouse.up();
    await expect(bar(page)).toContainText("3 clients sélectionnés");
    await expect(page.getByText("Tracez un rectangle sur la carte"), "l'outil se referme").toHaveCount(0);

    await bar(page).getByRole("button", { name: "Préparer une tournée" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("3 clients deviendront des arrêts");
    await dialog.getByLabel("Date").fill(TOUR_DATE);
    await dialog.getByLabel("Nom").fill(TOUR_NAME);
    await dialog.getByRole("button", { name: "Créer la journée" }).click();
    await page.waitForURL(`**/dashboard/tournees?date=${TOUR_DATE}`, { timeout: 20000 });

    const sql = neon(process.env.DATABASE_URL!);
    const stops = await sql`SELECT s.label, s.type, s."order" FROM "TourStop" s JOIN "TourRun" r ON r.id = s."tourRunId" WHERE r.name = ${TOUR_NAME} ORDER BY s."order"`;
    expect(stops.map((stop) => stop.type)).toEqual(["HOME", "HOME", "HOME"]);
    expect(stops.map((stop) => stop.label).sort()).toEqual(["Test SelDeuxE2E", "Test SelTroisE2E", "Test SelUnE2E"]);
  });

  test("sur téléphone, un mode sélection explicite au lieu d'un tracé au doigt", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openOnFixtures(page);
    await page.getByRole("button", { name: "Outils de carte" }).click();
    await expect(page.getByRole("button", { name: "Sélectionner une zone" }), "pas de tracé au doigt").toHaveCount(0);
    await page.getByRole("button", { name: "Choisir des clients un par un" }).click();
    await expect(page.getByText("Touchez des clients")).toBeVisible();
    await row(page, "SelUnE2E").getByRole("button").first().click();
    await row(page, "SelTroisE2E").getByRole("button").first().click();
    await expect(bar(page)).toContainText("2 clients sélectionnés");
    await expect(page.getByTestId("map-sheet"), "le panneau reste une liste").toHaveAttribute("data-snap", "compact");

    await page.getByRole("button", { name: "Outils de carte" }).click();
    await page.getByRole("button", { name: "Sélectionner les clients visibles" }).click();
    await expect(bar(page)).toContainText("3 clients sélectionnés");
  });
});
