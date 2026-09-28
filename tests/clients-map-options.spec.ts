import { config } from "dotenv";
import { expect, test, type Page } from "@playwright/test";
import { neon } from "./helpers/sql";

config({ path: ".env.local" });

/**
 * Carte clients, phase 7 : options avancées — état gardé dans l'adresse,
 * couleur par ancienneté de visite, actions de la fiche, liste limitée à la
 * zone affichée, survol synchronisé, relance groupée d'une zone (jusqu'à la
 * confirmation : aucun e-mail n'est envoyé ici).
 */

const testEmail = "praticien-test@pf-osteo-animale.fr";
const testPassword = "Praticien-Test-2026!";

// Loin des clients de démonstration (Finistère), pour des comptes exacts.
const fixtures = [
  { suffix: "q", lastName: "OptionsQuimperE2E", city: "Quimper", point: { lat: 47.996, lng: -4.102 }, due: true },
  { suffix: "b", lastName: "OptionsBrestE2E", city: "Brest", point: { lat: 48.39, lng: -4.486 }, due: false },
] as const;

async function cleanup() {
  const sql = neon(process.env.DATABASE_URL!);
  for (const fixture of fixtures) {
    await sql`DELETE FROM "Reminder" WHERE id = ${`tmp-options-reminder-${fixture.suffix}`}`;
    await sql`DELETE FROM "Animal" WHERE id = ${`tmp-options-animal-${fixture.suffix}`}`;
    await sql`DELETE FROM "Client" WHERE id = ${`tmp-options-client-${fixture.suffix}`}`;
  }
}

async function seed() {
  const sql = neon(process.env.DATABASE_URL!);
  for (const fixture of fixtures) {
    const clientId = `tmp-options-client-${fixture.suffix}`;
    const animalId = `tmp-options-animal-${fixture.suffix}`;
    await sql`INSERT INTO "Client" (id, "firstName", "lastName", phone, email, city, address, latitude, longitude, "geocodePrecision", "updatedAt") VALUES (${clientId}, 'Test', ${fixture.lastName}, '06 00 00 00 21', ${`options-${fixture.suffix}@example.fr`}, ${fixture.city}, '1 rue Test', ${fixture.point.lat}, ${fixture.point.lng}, 'EXACT', now())`;
    await sql`INSERT INTO "Animal" (id, "clientId", name, species, breed, age, weight, sex, avatar, "avatarBackground", history, conditions, treatments, notes, "updatedAt") VALUES (${animalId}, ${clientId}, ${`Pet${fixture.suffix}E2E`}, 'Chien', '', '', '', '', '', '', '', '', '', '', now())`;
    if (fixture.due) {
      await sql`INSERT INTO "Reminder" (id, "clientId", "animalId", "lastConsultation", delay, "dueDate", status, "updatedAt") VALUES (${`tmp-options-reminder-${fixture.suffix}`}, ${clientId}, ${animalId}, now() - interval '7 months', 'SIX_MONTHS', now() - interval '1 month', 'DUE', now())`;
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
const quimper = "/dashboard/carte?lieu=47.99600,-4.10200&nom=Quimper&rayon=10";

test.describe("Carte clients — options avancées", () => {
  test.describe.configure({ mode: "serial" });
  test.beforeAll(async () => { await cleanup(); await seed(); });
  test.afterAll(cleanup);
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  test("l'adresse garde le lieu et le rayon ; la relance de la zone demande confirmation", async ({ page }) => {
    await page.goto(quimper, { waitUntil: "networkidle" });
    await expect(row(page, "OptionsQuimperE2E")).toBeVisible({ timeout: 15000 });
    await expect(row(page, "OptionsBrestE2E"), "Brest est hors du rayon").toHaveCount(0);
    await expect(page.getByText("1 client à relancer")).toBeVisible();

    await page.getByRole("button", { name: "Envoyer les rappels" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("Envoyer 1 rappel ?");
    await expect(dialog).toContainText("Test OptionsQuimperE2E");
    await dialog.getByRole("button", { name: "Annuler" }).click();
    await expect(dialog).toHaveCount(0);
    const sql = neon(process.env.DATABASE_URL!);
    const [reminder] = await sql`SELECT status FROM "Reminder" WHERE id = 'tmp-options-reminder-q'`;
    expect(reminder.status, "rien n'est envoyé sans confirmation").toBe("DUE");
  });

  test("colorer par dernière visite : légende adaptée, choix gardé dans l'adresse", async ({ page }) => {
    await page.goto(quimper, { waitUntil: "networkidle" });
    await page.getByLabel("Couleur").selectOption({ label: "Dernière visite" });
    await expect(page.getByText("Plus de 12 mois ou jamais")).toBeVisible();
    await expect(marker(page, "OptionsQuimperE2E")).toHaveAttribute("title", /jamais vu/);
    await expect.poll(() => page.url()).toContain("couleur=visit");

    await page.reload({ waitUntil: "networkidle" });
    await expect(page.getByLabel("Couleur")).toHaveValue("visit");
  });

  test("la fiche propose Appeler, Itinéraire et Nouveau RDV (client prérempli)", async ({ page }) => {
    await page.goto(quimper, { waitUntil: "networkidle" });
    await row(page, "OptionsQuimperE2E").getByRole("button").first().click();
    await expect(page.getByRole("link", { name: "Appeler" })).toHaveAttribute("href", "tel:+33600000021");
    await expect(page.getByRole("link", { name: "Itinéraire" })).toHaveAttribute("href", /destination=47\.996,-4\.102/);
    await expect.poll(() => page.url()).toContain("client=tmp-options-client-q");

    await page.getByRole("button", { name: "Nouveau RDV" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText(/OptionsQuimperE2E/).or(dialog.locator('input[value*="OptionsQuimperE2E"]')).first()).toBeVisible();
  });

  test("« Uniquement cette zone » et survol synchronisé", async ({ page }) => {
    await page.goto("/dashboard/carte", { waitUntil: "networkidle" });
    await expect(row(page, "OptionsBrestE2E")).toBeVisible({ timeout: 15000 });
    // Zoom sur Quimper (choisir le client), puis refermer la fiche.
    await row(page, "OptionsQuimperE2E").getByRole("button").first().click();
    await page.waitForTimeout(900);
    await page.keyboard.press("Escape");

    await page.getByLabel("Uniquement cette zone").check();
    await expect(row(page, "OptionsBrestE2E"), "Brest n'est pas à l'écran").toHaveCount(0);
    await expect(row(page, "OptionsQuimperE2E")).toBeVisible();
    await expect.poll(() => page.url()).toContain("vue=visible");

    await row(page, "OptionsQuimperE2E").hover();
    await expect(marker(page, "OptionsQuimperE2E"), "halo sur le marqueur").toHaveClass(/map-marker-highlight/);

    await page.getByLabel("Uniquement cette zone").uncheck();
    await expect(row(page, "OptionsBrestE2E")).toBeVisible();
  });

  test("Plein écran puis retour", async ({ page }) => {
    await page.goto(quimper, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Plein écran" }).click();
    await expect(page.getByRole("button", { name: "Quitter le plein écran" })).toBeVisible();
    await page.getByRole("button", { name: "Quitter le plein écran" }).click();
    await expect(page.getByRole("button", { name: "Plein écran" })).toBeVisible();
  });
});
