import { config } from "dotenv";
import { expect, test, type Page } from "@playwright/test";
import { neon } from "./helpers/sql";

config({ path: ".env.local" });

/**
 * Carte clients, phase 8.8 : informations d'un secteur — des comptes
 * expliqués (pas vus depuis 12 mois, rappels à envoyer, rendez-vous à
 * domicile de la semaine), chacun avec son action, et une suggestion de
 * tournée quand des clients à relancer sont regroupés. Aucun envoi ici.
 */

const testEmail = "praticien-test@pf-osteo-animale.fr";
const testPassword = "Praticien-Test-2026!";

// Zone vide de clients de démonstration (pays d'Ouche).
const fixtures = [
  { suffix: "1", lastName: "SecteurUnE2E", point: { lat: 49.0, lng: 0.6 } },
  { suffix: "2", lastName: "SecteurDeuxE2E", point: { lat: 49.01, lng: 0.61 } },
  { suffix: "3", lastName: "SecteurTroisE2E", point: { lat: 48.99, lng: 0.59 } },
] as const;
const in3Days = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(Date.now() + 3 * 86400000));

async function cleanup() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`DELETE FROM "Appointment" WHERE id = 'tmp-insights-appt'`;
  await sql`DELETE FROM "Reminder" WHERE id LIKE 'tmp-insights-reminder-%'`;
  await sql`DELETE FROM "Animal" WHERE id LIKE 'tmp-insights-animal-%'`;
  await sql`DELETE FROM "Client" WHERE id LIKE 'tmp-insights-client-%'`;
}

async function seed() {
  const sql = neon(process.env.DATABASE_URL!);
  for (const fixture of fixtures) {
    const clientId = `tmp-insights-client-${fixture.suffix}`;
    const animalId = `tmp-insights-animal-${fixture.suffix}`;
    await sql`INSERT INTO "Client" (id, "firstName", "lastName", phone, email, city, address, latitude, longitude, "geocodePrecision", "updatedAt") VALUES (${clientId}, 'Test', ${fixture.lastName}, '0600000071', ${`insights-${fixture.suffix}@example.fr`}, 'Commune test', '1 rue Test', ${fixture.point.lat}, ${fixture.point.lng}, 'EXACT', now())`;
    await sql`INSERT INTO "Animal" (id, "clientId", name, species, breed, age, weight, sex, avatar, "avatarBackground", history, conditions, treatments, notes, "updatedAt") VALUES (${animalId}, ${clientId}, ${`Pet${fixture.suffix}SecteurE2E`}, 'Cheval', '', '', '', '', '', '', '', '', '', '', now())`;
    await sql`INSERT INTO "Reminder" (id, "clientId", "animalId", "lastConsultation", delay, "dueDate", status, "updatedAt") VALUES (${`tmp-insights-reminder-${fixture.suffix}`}, ${clientId}, ${animalId}, now() - interval '14 months', 'TWELVE_MONTHS', now() - interval '1 month', 'DUE', now())`;
  }
  await sql`
    INSERT INTO "Appointment" (id, "clientId", "animalId", "clientName", "animalName", "serviceName", date, start, duration, mode, location, city, latitude, longitude, price, status, notes, "createdAt", "updatedAt")
    VALUES ('tmp-insights-appt', 'tmp-insights-client-1', 'tmp-insights-animal-1', 'Test SecteurUnE2E', 'Pet1SecteurE2E', 'Séance E2E', ${in3Days}::date, '10:00', 45, 'DOMICILE', '1 rue Test', 'Commune test', 49.0, 0.6, 60, 'CONFIRMED', '', now(), now())
  `;
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

const modeButton = (page: Page, name: string) => page.getByRole("group", { name: "Mode de la carte" }).getByRole("button", { name });
const secteur = "/dashboard/carte?lieu=49.00000,0.60000&nom=Secteur%20test&rayon=5";

test.describe("Carte clients — informations d'un secteur", () => {
  test.beforeAll(async () => { await cleanup(); await seed(); });
  test.afterAll(cleanup);

  test("comptes expliqués, actions, et suggestion de tournée", async ({ page }) => {
    await login(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(secteur, { waitUntil: "networkidle" });

    const insights = page.getByTestId("map-insights");
    await expect(insights).toContainText("3 clients n’ont pas été vus depuis plus de 12 mois (ou jamais).");
    await expect(insights).toContainText("3 clients à relancer dans cette zone : 3 rappels à envoyer.");
    await expect(insights).toContainText("1 rendez-vous à domicile est déjà programmé ici dans les 7 prochains jours.");
    await expect(insights).toContainText("3 clients à relancer sont regroupés dans cette zone.");
    await expect(insights, "jamais de promesse d'optimisation").not.toContainText(/optimal/i);

    await insights.getByRole("button", { name: "Préparer une tournée" }).click();
    await expect(page.getByRole("dialog")).toContainText("3 clients deviendront des arrêts");
    await page.getByRole("dialog").getByRole("button", { name: "Annuler" }).click();

    await insights.getByRole("button", { name: "Voir les RDV" }).click();
    await expect(modeButton(page, "Activité")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("group", { name: "Période" }).getByRole("button", { name: "7 jours" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator('[data-appointment-row="tmp-insights-appt"]')).toBeVisible();

    await page.goto(secteur, { waitUntil: "networkidle" });
    await page.getByTestId("map-insights").getByRole("button", { name: "Voir les 3" }).click();
    await expect(modeButton(page, "Relances")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("group", { name: "Suivi des visites" }).getByRole("button", { name: "Plus de 12 mois ou jamais" })).toHaveAttribute("aria-pressed", "true");
  });

  test("les groupes de points disent ce qu'ils contiennent, selon le mode", async ({ page }) => {
    await login(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    // Vue d'ensemble : les trois clients du secteur forment un groupe.
    await page.goto("/dashboard/carte", { waitUntil: "networkidle" });
    const group = page.locator('.leaflet-marker-icon[title="3 clients ici, dont 3 à relancer — afficher le détail"]');
    await expect(group).toBeVisible({ timeout: 15000 });
    await expect(group, "pastille des clients à relancer").toContainText("3");

    await modeButton(page, "Relances").click();
    const reminders = page.locator('.leaflet-marker-icon[title="3 clients ici, dont 3 à relancer — afficher le détail"]');
    await expect(reminders).toBeVisible();
    await expect(reminders.locator("svg"), "la cloche des relances").toHaveCount(1);
  });
});
