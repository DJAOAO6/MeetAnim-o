import { expect, test, type Page } from "@playwright/test";
import { neon } from "./helpers/sql";
import { config } from "dotenv";

config({ path: ".env.local" });
const sql = neon(process.env.DATABASE_URL!);

const PROFESSIONAL_SLUG = "pauline-faucillon";
const ZONE_NAME = "E2E-Suggestion Secteur Nord";
const TOUR_NAME = "E2E-Suggestion Tournée Nord";
/** Ville et code postal inventés : aucune chance de heurter de vraies données. */
const CITY = "Villetest-sur-Seine";
const POSTAL_CODE = "76999";

/**
 * Suggestion de créneaux de tournée sur la page publique de réservation.
 *
 * Ce qui compte ici : qu'un visiteur dont l'adresse tombe dans le secteur
 * d'une tournée se voie proposer les jours où le professionnel sera déjà chez
 * lui — et qu'une adresse hors secteur ne change rien du tout au parcours.
 *
 * La suggestion ne crée aucune liaison en base : un rendez-vous à domicile
 * pris ce jour-là dans cette zone *est* un arrêt de la tournée, par
 * construction (voir computeTourOccurrence). Le dernier test le vérifie.
 */
async function cleanup() {
  await sql`DELETE FROM "Appointment" WHERE "clientName" LIKE 'E2E-Suggestion%'`;
  await sql`DELETE FROM "Tour" WHERE name LIKE 'E2E-Suggestion%'`;
  await sql`DELETE FROM "Zone" WHERE name LIKE 'E2E-Suggestion%'`;
}

/** Jour de la semaine, en français, tel que le stocke une tournée. */
const WEEKDAYS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];

function toDateId(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/**
 * Crée une zone et une tournée hebdomadaire passant un jour ouvré précis.
 * Mardi par défaut : jour ouvert dans le profil de démonstration.
 */
async function seedTour({ weekday = 2, maxStops = null as number | null } = {}) {
  await cleanup();
  const zoneId = `e2e-zone-${Date.now()}`;
  const tourId = `e2e-tour-${Date.now()}`;

  await sql`INSERT INTO "Zone" (id, name) VALUES (${zoneId}, ${ZONE_NAME})`;
  await sql`INSERT INTO "City" (id, name, "postalCode", "zoneId") VALUES (${`${zoneId}-city`}, ${CITY}, ${POSTAL_CODE}, ${zoneId})`;
  await sql`
    INSERT INTO "Tour" (id, name, recurrence, day, "dateLabel", "startTime", "endTime", "zoneId", status, "estimatedKm", "startType", "maxStops")
    VALUES (${tourId}, ${TOUR_NAME}, 'Toutes les semaines', ${WEEKDAYS[weekday]}, 'Chaque semaine', '09:00', '12:00', ${zoneId}, 'ACTIVE', 0, 'CABINET', ${maxStops})
  `;
  // Multi-zone : la relation moderne est celle que lit le calcul des arrêts.
  await sql`INSERT INTO "_TourZones" ("A", "B") VALUES (${tourId}, ${zoneId})`;
  return { zoneId, tourId };
}

/** Amène le tunnel jusqu'à l'étape adresse, en mode domicile. */
async function gotoAddressStep(page: Page) {
  await page.addInitScript(() => sessionStorage.clear());
  await page.goto(`/reserver/${PROFESSIONAL_SLUG}`, { waitUntil: "networkidle" });

  await expect(page.getByText("Quelle consultation souhaitez-vous")).toBeVisible();
  await page.locator("button[aria-pressed]").first().click();
  await page.getByRole("button", { name: "Consultation à domicile", exact: true }).click();
  await page.locator('button[type="submit"]').click();

  await expect(page.getByText("Choisissez votre créneau")).toBeVisible();
  // Première date puis premier horaire proposés : le test ne porte pas sur le
  // calendrier, seulement sur ce qui suit. Mêmes sélecteurs que
  // schedule-calendar.spec.ts, pour ne pas inventer une seconde façon de
  // parcourir le tunnel.
  await page.locator('[role="gridcell"][aria-disabled="false"]').first().click();
  await expect(page.getByText("Choisissez une heure")).toBeVisible();
  await page.locator('button:has-text(":")').first().click();
  const submit = page.locator('button[type="submit"]');
  await submit.scrollIntoViewIfNeeded();
  await submit.click();

  await expect(page.getByText("Quelques informations")).toBeVisible({ timeout: 15000 });
}

/**
 * Renseigne le lieu du rendez-vous. Les champs sont visés par leur
 * identifiant : les libellés portent un astérisque de champ requis, et
 * plusieurs étapes du tunnel parlent de ville.
 */
async function fillAddress(page: Page, city: string, postalCode: string) {
  // L'étape est un accordéon : le bloc adresse s'ouvre avant d'être rempli,
  // sinon l'en-tête replié intercepte les clics.
  const header = page.locator("#booking-details-header-address");
  if ((await header.getAttribute("aria-expanded")) === "false") await header.click();
  await expect(page.locator("#booking-details-city")).toBeEditable();

  await page.locator("#booking-details-address").fill(`1 rue de Test, ${postalCode} ${city}`);
  await page.locator("#booking-details-postalCode").fill(postalCode);
  const cityField = page.locator("#booking-details-city");
  await cityField.fill(city);
  await cityField.blur();
}

test.beforeAll(cleanup);
test.afterAll(cleanup);

test("une adresse hors secteur ne change rien au parcours", async ({ page }) => {
  await seedTour();
  await gotoAddressStep(page);
  await fillAddress(page, "Marseille", "13001");

  await expect(page.getByText("Un passage est prévu près de chez vous")).toHaveCount(0);
  await expect(page.getByText(/Recherche des passages/)).toHaveCount(0);
  // Le formulaire reste utilisable exactement comme avant.
  await expect(page.locator("#booking-details-city")).toHaveValue("Marseille");
});

test("une adresse dans le secteur fait apparaître les passages à venir", async ({ page }) => {
  await seedTour();
  await gotoAddressStep(page);
  await fillAddress(page, CITY, POSTAL_CODE);

  const panel = page.getByRole("region", { name: "Un passage est prévu près de chez vous" });
  await expect(panel).toBeVisible({ timeout: 15000 });
  await expect(panel.getByText("Créneaux recommandés")).toBeVisible();
  await expect(panel.getByText(TOUR_NAME)).toBeVisible();
  await expect(panel.getByText(`Secteur : ${CITY}`)).toBeVisible();

  // Les créneaux proposés tombent tous pendant le passage (09:00 → 12:00).
  const slots = await panel.getByRole("button", { name: /^\d{2}:\d{2}$/ }).allTextContents();
  expect(slots.length).toBeGreaterThan(0);
  for (const slot of slots) {
    expect(slot >= "09:00" && slot < "12:00", `le créneau ${slot} sort du passage`).toBe(true);
  }

  // Et le jour proposé est bien un mardi.
  const dayLabel = (await panel.locator("p", { hasText: /^\w+ \d{1,2} \w+ \d{4}$/ }).first().textContent()) ?? "";
  expect(dayLabel.toLocaleLowerCase("fr-FR")).toContain("mardi");
});

test("choisir un créneau déplace le rendez-vous sans vider le formulaire", async ({ page }) => {
  await seedTour();
  await gotoAddressStep(page);

  // Une information saisie avant : elle doit survivre au déplacement.
  await page.locator("#booking-details-firstName").fill("Camille");
  await fillAddress(page, CITY, POSTAL_CODE);

  const panel = page.getByRole("region", { name: "Un passage est prévu près de chez vous" });
  await expect(panel).toBeVisible({ timeout: 15000 });
  const slot = panel.getByRole("button", { name: /^\d{2}:\d{2}$/ }).first();
  const chosenTime = (await slot.textContent())!.trim();
  await slot.click();

  // Confirmation légère, et le créneau retenu se voit.
  await expect(page.getByText(/Votre rendez-vous a été déplacé au/)).toBeVisible();
  await expect(page.getByText(new RegExp(`à ${chosenTime}`))).toBeVisible();
  await expect(slot).toHaveAttribute("aria-pressed", "true");

  // Rien n'a été réinitialisé.
  await expect(page.locator("#booking-details-firstName")).toHaveValue("Camille");
  await expect(page.locator("#booking-details-city")).toHaveValue(CITY);
});

test("la suggestion s’ignore, et le créneau d’origine reste valable", async ({ page }) => {
  await seedTour();
  await gotoAddressStep(page);
  await fillAddress(page, CITY, POSTAL_CODE);

  const panel = page.getByRole("region", { name: "Un passage est prévu près de chez vous" });
  await expect(panel).toBeVisible({ timeout: 15000 });
  await panel.getByRole("button", { name: /Ignorer la suggestion/ }).click();

  await expect(panel).toHaveCount(0);
  // Le parcours continue : l'étape suivante reste accessible.
  await expect(page.locator("#booking-details-city")).toHaveValue(CITY);
});

test("changer d’adresse après avoir choisi un créneau de tournée avertit le client", async ({ page }) => {
  await seedTour();
  await gotoAddressStep(page);
  await fillAddress(page, CITY, POSTAL_CODE);

  const panel = page.getByRole("region", { name: "Un passage est prévu près de chez vous" });
  await expect(panel).toBeVisible({ timeout: 15000 });
  await panel.getByRole("button", { name: /^\d{2}:\d{2}$/ }).first().click();
  await expect(page.getByText(/Votre rendez-vous a été déplacé au/)).toBeVisible();

  // Nouvelle adresse, hors du secteur : le créneau ne correspond plus à rien.
  await fillAddress(page, "Marseille", "13001");

  await expect(page.getByRole("alert").filter({ hasText: /n’est plus dans le secteur/ })).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(/Votre rendez-vous a été déplacé au/)).toHaveCount(0);
});

test("une tournée pleine ne propose plus de créneau", async ({ page }) => {
  const { } = await seedTour({ maxStops: 1 });

  // Un rendez-vous à domicile déjà posé dans le secteur, le jour du passage.
  const today = new Date();
  const target = new Date(today);
  target.setDate(target.getDate() + 1);
  while (target.getDay() !== 2) target.setDate(target.getDate() + 1);
  const dateId = toDateId(target);

  await sql`
    INSERT INTO "Appointment" (id, "clientName", "animalName", "serviceName", date, start, duration, mode, location, price, status, notes, "postalCode", city, "createdAt", "updatedAt")
    VALUES (${`e2e-sugg-${Date.now()}`}, 'E2E-Suggestion Plein', 'Filou', 'Séance', ${`${dateId}T00:00:00.000Z`}, '09:00', 60, 'DOMICILE', ${`1 rue Test, ${POSTAL_CODE} ${CITY}`}, 60, 'CONFIRMED', '', ${POSTAL_CODE}, ${CITY}, now(), now())
  `;

  await gotoAddressStep(page);
  await fillAddress(page, CITY, POSTAL_CODE);

  // Le premier passage est complet : soit rien n'est proposé, soit seulement
  // des dates ultérieures — jamais celle qui est pleine.
  await page.waitForTimeout(2500);
  const panel = page.getByRole("region", { name: "Un passage est prévu près de chez vous" });
  if (await panel.count()) {
    const text = (await panel.textContent()) ?? "";
    const frenchDay = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long" }).format(target);
    expect(text.toLocaleLowerCase("fr-FR"), "le passage complet ne doit pas être proposé").not.toContain(frenchDay.toLocaleLowerCase("fr-FR"));
  }
});
