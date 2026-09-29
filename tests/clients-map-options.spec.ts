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

const in5Days = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(Date.now() + 5 * 86400000));
const in5DaysLabel = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${in5Days}T00:00:00Z`));

async function cleanup() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`DELETE FROM "Appointment" WHERE id = 'tmp-options-appt-q'`;
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
      await sql`
        INSERT INTO "Appointment" (id, "clientId", "animalId", "clientName", "animalName", "serviceName", date, start, duration, mode, location, price, status, notes, "createdAt", "updatedAt")
        VALUES ('tmp-options-appt-q', ${clientId}, ${animalId}, 'Test OptionsQuimperE2E', 'PetqE2E', 'Séance E2E', ${in5Days}::date, '14:30', 30, 'CABINET', 'Cabinet', 50, 'CONFIRMED', '', now(), now())
      `;
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
    // Mini centre d'action : prochain rendez-vous, origine de la position, distance.
    const card = page.getByRole("button", { name: "Fermer la fiche de Test OptionsQuimperE2E" }).locator("xpath=ancestor::div[contains(@class,'rounded-2xl')][1]");
    await expect(card).toContainText(`Prochain rendez-vous${in5DaysLabel} — 14:30`);
    await expect(card).toContainText("PositionAdresse du client · précise");
    await expect(card).toContainText(/km du (cabinet|lieu d’exercice)/);

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

  test("le lieu d'exercice a sa fiche : clients autour, centrer, créer un périmètre", async ({ page }) => {
    await page.goto("/dashboard/carte", { waitUntil: "networkidle" });
    await page.locator(".leaflet-marker-icon").filter({ has: page.locator("svg") }).and(page.locator('[title^="Mon "]')).click();
    const card = page.getByTestId("practice-card");
    await expect(card).toContainText(/Mon (cabinet|lieu d’exercice)/);
    for (const km of [15, 30, 50]) await expect(card).toContainText(new RegExp(`\\d+ clients? à moins de ${km} km`));

    await card.getByRole("button", { name: "Créer un périmètre" }).click();
    await expect(card).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^15 km autour de votre (cabinet|lieu d’exercice)/ })).toBeVisible();
  });

  test("Plan / Aérien : les photos IGN remplacent le plan, au même zoom, filtres gardés", async ({ page }) => {
    await page.goto(quimper, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500); // fin du cadrage sur le périmètre
    // Zoom affiché : le plus fin des niveaux de tuiles chargés.
    const shownZoom = (source: string) => page.evaluate((pattern) => {
      const expression = new RegExp(pattern);
      const levels = [...document.querySelectorAll<HTMLImageElement>(".leaflet-tile-pane img.leaflet-tile")]
        .map((image) => image.src.match(expression)?.[1])
        .filter((level): level is string => Boolean(level))
        .map(Number);
      return levels.length ? Math.max(...levels) : null;
    }, source);
    const planZoom = await shownZoom("openstreetmap\\.org/(\\d+)/");
    expect(planZoom).not.toBeNull();

    const basemap = page.getByRole("group", { name: "Fond de carte" });
    await basemap.getByRole("button", { name: "Aérien" }).click();
    await expect(basemap.getByRole("button", { name: "Aérien" })).toHaveAttribute("aria-pressed", "true");
    const tile = page.locator(".leaflet-tile-pane img.leaflet-tile").first();
    await expect(tile).toHaveAttribute("src", /data\.geopf\.fr\/wmts.*ORTHOIMAGERY\.ORTHOPHOTOS/);
    await expect.poll(() => shownZoom("ORTHOPHOTOS.*TILEMATRIX=(\\d+)&"), { message: "même zoom" }).toBe(planZoom);
    await expect(page.locator(".leaflet-control-attribution")).toContainText("IGN");
    await expect(row(page, "OptionsQuimperE2E"), "le périmètre et la liste restent").toBeVisible();
    await expect(row(page, "OptionsBrestE2E")).toHaveCount(0);
    await expect.poll(() => page.url()).toContain("fond=aerien");

    await basemap.getByRole("button", { name: "Plan" }).click();
    await expect(tile).toHaveAttribute("src", /openstreetmap\.org/);
  });

  test("Plein écran puis retour", async ({ page }) => {
    await page.goto(quimper, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Plein écran" }).click();
    await expect(page.getByRole("button", { name: "Quitter le plein écran" })).toBeVisible();
    await page.getByRole("button", { name: "Quitter le plein écran" }).click();
    await expect(page.getByRole("button", { name: "Plein écran" })).toBeVisible();
  });
});
