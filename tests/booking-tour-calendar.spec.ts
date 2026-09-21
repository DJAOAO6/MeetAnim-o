import { expect, test, type Page } from "@playwright/test";
import { neon } from "./helpers/sql";
import { config } from "dotenv";

config({ path: ".env.local" });
const sql = neon(process.env.DATABASE_URL!);

const PROFESSIONAL_SLUG = "pauline-faucillon";
const ZONE_NAME = "E2E-Calendrier Secteur";
const TOUR_NAME = "E2E-Calendrier Tournée";
/** Code postal inventé : aucune chance de heurter de vraies données. */
const POSTAL_CODE = "76998";
const CITY = "Villecalendrier";
const TOUR_WEEKDAY = "Mardi";

/**
 * Jours de passage annoncés dans le calendrier de prise de rendez-vous.
 *
 * Le problème que ceci corrige : l'information arrivait après la décision
 * qu'elle devait éclairer. Le visiteur choisissait sa date, puis apprenait à
 * l'étape suivante qu'une autre aurait été plus simple — on lui demandait de
 * se dédire.
 *
 * Trois garde-fous tenus ici, parce qu'un repère mal placé est pire que pas
 * de repère du tout :
 *
 * - on ne demande le code postal que s'il sert à quelque chose ;
 * - un code postal hors secteur ne marque rien, et ne dit rien ;
 * - au cabinet, le calendrier reste strictement celui d'avant.
 */
async function cleanup() {
  await sql`DELETE FROM "Tour" WHERE name LIKE 'E2E-Calendrier%'`;
  await sql`DELETE FROM "Zone" WHERE name LIKE 'E2E-Calendrier%'`;
}

async function seedTour() {
  await cleanup();
  const zoneId = `e2e-cal-zone-${Date.now()}`;
  const tourId = `e2e-cal-tour-${Date.now()}`;
  await sql`INSERT INTO "Zone" (id, name) VALUES (${zoneId}, ${ZONE_NAME})`;
  await sql`INSERT INTO "City" (id, name, "postalCode", "zoneId") VALUES (${`${zoneId}-city`}, ${CITY}, ${POSTAL_CODE}, ${zoneId})`;
  await sql`
    INSERT INTO "Tour" (id, name, recurrence, day, "dateLabel", "startTime", "endTime", "zoneId", status, "estimatedKm", "startType")
    VALUES (${tourId}, ${TOUR_NAME}, 'Toutes les semaines', ${TOUR_WEEKDAY}, 'Chaque semaine', '09:00', '18:00', ${zoneId}, 'ACTIVE', 0, 'CABINET')
  `;
  await sql`INSERT INTO "_TourZones" ("A", "B") VALUES (${tourId}, ${zoneId})`;
}

/** Amène jusqu'au choix du mode, prestation sélectionnée. */
async function gotoModeChoice(page: Page) {
  await page.addInitScript(() => sessionStorage.clear());
  await page.goto(`/reserver/${PROFESSIONAL_SLUG}`, { waitUntil: "networkidle" });
  await expect(page.getByText("Quelle consultation souhaitez-vous")).toBeVisible();
  await page.locator("button[aria-pressed]").first().click();
}

const champCodePostal = (page: Page) => page.getByLabel("Votre code postal");

test.describe.configure({ mode: "serial" });

test.beforeAll(seedTour);
test.afterAll(cleanup);

test("le code postal révèle les jours de passage, et le calendrier les marque", async ({ page }) => {
  await gotoModeChoice(page);

  // Au cabinet : rien ne change, le code postal n'a rien à voir là-dedans.
  await page.getByRole("button", { name: "Consultation au cabinet", exact: true }).click();
  await expect(champCodePostal(page)).toHaveCount(0);

  await page.getByRole("button", { name: "Consultation à domicile", exact: true }).click();
  await expect(champCodePostal(page)).toBeVisible();

  // Un code postal hors secteur ne promet rien.
  await champCodePostal(page).fill("75001");
  await expect(page.getByText(new RegExp(ZONE_NAME))).toHaveCount(0);

  await champCodePostal(page).fill(POSTAL_CODE);
  await expect(page.getByText(new RegExp(`${ZONE_NAME}.*passage régulier le mardi`))).toBeVisible();

  // Le calendrier, à l'étape suivante : les mardis sont marqués, et eux seuls.
  await page.locator('button[type="submit"]').click();
  await expect(page.getByText("Choisissez votre créneau")).toBeVisible();
  await expect(page.getByText(/nous passons déjà dans le secteur/i)).toBeVisible();

  const marques = page.locator('[role="gridcell"][aria-label*="passage prévu"]');
  await expect(marques.first()).toBeVisible({ timeout: 15000 });
  for (const label of await marques.evaluateAll((cells) => cells.map((cell) => cell.getAttribute("aria-label") ?? ""))) {
    expect(label.toLowerCase(), `« ${label} » ne devrait pas être marqué`).toContain("mardi");
  }

  // Un jour marqué reste un jour ordinaire : il se choisit comme les autres.
  await marques.first().click();
  await expect(page.getByText("Choisissez une heure")).toBeVisible();
});

test("sans code postal renseigné, le calendrier ne marque rien", async ({ page }) => {
  await gotoModeChoice(page);
  await page.getByRole("button", { name: "Consultation à domicile", exact: true }).click();
  await expect(champCodePostal(page)).toBeVisible();

  await page.locator('button[type="submit"]').click();
  await expect(page.getByText("Choisissez votre créneau")).toBeVisible();
  await expect(page.locator('[role="gridcell"][aria-label*="passage prévu"]')).toHaveCount(0);
  await expect(page.getByText(/nous passons déjà dans le secteur/i)).toHaveCount(0);
});

test("sans aucune tournée, le code postal n'est pas demandé du tout", async ({ page }) => {
  await cleanup();
  await gotoModeChoice(page);
  await page.getByRole("button", { name: "Consultation à domicile", exact: true }).click();
  // Un champ de plus avant de choisir sa date ne se justifie que s'il sert.
  await expect(champCodePostal(page)).toHaveCount(0);

  await page.locator('button[type="submit"]').click();
  await expect(page.getByText("Choisissez votre créneau")).toBeVisible();
  await expect(page.locator('[role="gridcell"][aria-label*="passage prévu"]')).toHaveCount(0);
});
