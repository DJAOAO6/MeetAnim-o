import { config } from "dotenv";
import { expect, test, type Page } from "@playwright/test";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.local" });

/**
 * Refonte tournées, phase 3.2 : l'ordre du tunnel public (créneau avant
 * adresse, commit 16acbdf) empêche de trier/étiqueter les créneaux par
 * tournée dès l'étape Rendez-vous — l'adresse n'est connue qu'à l'étape
 * suivante. Bandeau de réassurance a posteriori à la place : une fois
 * l'adresse saisie, si elle tombe dans une zone qui passe justement le jour
 * déjà choisi, on l'affiche explicitement (jamais un tri/filtre des
 * créneaux eux-mêmes).
 */

const PROFESSIONAL_SLUG = "pauline-faucillon";

const testZoneId = "tmp-p32-zone";
const testCityId = "tmp-p32-city";
const testTourId = "tmp-p32-tour";
const testCityName = "VilleTestP32";
const testZoneName = "Zone E2E Bandeau P3.2";

const weekdayLabels = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];

function toDateId(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function weekdayLabelFor(date: Date): string {
  return weekdayLabels[date.getDay()];
}

// Même formatage que formatBookingDateLabels().fullLabel (booking-validation.ts) :
// reproduit ici pour construire le nom accessible attendu de la cellule du
// calendrier, sans dépendre d'un import serveur depuis un fichier de test.
const fullDateFormatter = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
function fullLabelFor(date: Date): string {
  const formatted = fullDateFormatter.format(date);
  return formatted.charAt(0).toLocaleUpperCase("fr-FR") + formatted.slice(1);
}

// La tournée seed passe le jour de tourDate ; sameZoneOtherDayDate (le
// lendemain, même fenêtre de réservation) tombe forcément sur un autre jour
// de la semaine (jamais le même que tourDate) — utile pour vérifier que le
// bandeau reste générique quand la zone correspond mais pas le jour choisi.
const tourDate = (() => {
  const date = new Date();
  date.setDate(date.getDate() + 65);
  return date;
})();
const sameZoneOtherDayDate = (() => {
  const date = new Date(tourDate.getTime());
  date.setDate(date.getDate() + 1);
  return date;
})();

const tourDateId = toDateId(tourDate);
const tourWeekday = weekdayLabelFor(tourDate);
const otherWeekday = weekdayLabelFor(sameZoneOtherDayDate);

type StoredBusinessProfile = { id: string; availability: unknown };
let originalProfile: StoredBusinessProfile | null = null;

/**
 * Même schéma que tests/tour-fill-opportunity.spec.ts : les disponibilités
 * réelles sont des données de dev arbitraires — les deux jours ciblés par ce
 * test (celui de la tournée, et le lendemain) sont temporairement forcés
 * grand ouverts pour que leurs créneaux existent et soient sélectionnables
 * de façon déterministe, puis restaurés en afterAll.
 */
async function overrideAvailabilityForTargetDays() {
  const sql = neon(process.env.DATABASE_URL!);
  const [row] = await sql`SELECT id, availability FROM "BusinessProfile" LIMIT 1`;
  if (!row) throw new Error("Aucun BusinessProfile en base — prérequis du test.");
  originalProfile = { id: row.id, availability: row.availability };

  const availability = row.availability as {
    days: Array<{ id: string; label: string; enabled: boolean; slots: Array<{ id: string; start: string; end: string; cabinet: boolean; home: boolean }> }>;
  };
  const openSlot = (id: string) => [{ id, start: "08:00", end: "20:00", cabinet: true, home: true }];
  const nextDays = availability.days.map((day) => {
    if (day.label === tourWeekday) return { ...day, enabled: true, slots: openSlot("tmp-p32-slot-tour") };
    if (day.label === otherWeekday) return { ...day, enabled: true, slots: openSlot("tmp-p32-slot-other") };
    return day;
  });
  const nextAvailability = { ...availability, days: nextDays };
  await sql`UPDATE "BusinessProfile" SET availability = ${JSON.stringify(nextAvailability)}::jsonb WHERE id = ${row.id}`;
}

async function restoreAvailability() {
  if (!originalProfile) return;
  const sql = neon(process.env.DATABASE_URL!);
  await sql`UPDATE "BusinessProfile" SET availability = ${JSON.stringify(originalProfile.availability)}::jsonb WHERE id = ${originalProfile.id}`;
}

async function seed() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`INSERT INTO "Zone" (id, name) VALUES (${testZoneId}, ${testZoneName})`;
  await sql`INSERT INTO "City" (id, name, "postalCode", "zoneId") VALUES (${testCityId}, ${testCityName}, '76400', ${testZoneId})`;
  await sql`
    INSERT INTO "Tour" (id, name, recurrence, day, "dateId", "dateLabel", "startTime", "endTime", "zoneId", status)
    VALUES (${testTourId}, 'Tournée E2E Bandeau P3.2', 'Une seule fois', ${tourWeekday}, ${tourDateId}, 'test', '08:00', '20:00', ${testZoneId}, 'ACTIVE')
  `;
}

async function cleanup() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`DELETE FROM "Tour" WHERE id = ${testTourId}`;
  await sql`DELETE FROM "City" WHERE "zoneId" = ${testZoneId}`;
  await sql`DELETE FROM "Zone" WHERE id = ${testZoneId}`;
}

/** Nombre de clics "Mois suivant" pour aller du mois de départ de la fenêtre (demain) au mois de `date`. */
function monthsToAdvance(date: Date): number {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return (date.getFullYear() - tomorrow.getFullYear()) * 12 + (date.getMonth() - tomorrow.getMonth());
}

async function bookUntilAddressStep(page: Page, targetDate: Date) {
  await page.goto(`/reserver/${PROFESSIONAL_SLUG}`);
  await expect(page.getByText("Quelle consultation souhaitez-vous")).toBeVisible();

  await page.locator("button[aria-pressed]").first().click();
  await page.getByRole("button", { name: "Consultation à domicile", exact: true }).click();
  await page.locator('button[type="submit"]').click();

  await expect(page.getByText("Choisissez votre créneau")).toBeVisible();
  const advances = monthsToAdvance(targetDate);
  for (let index = 0; index < advances; index++) {
    await page.getByRole("button", { name: "Mois suivant" }).click();
  }
  const targetCell = page.getByRole("gridcell", { name: fullLabelFor(targetDate), exact: true });
  await expect(targetCell).toBeVisible();
  await targetCell.click();
  await expect(page.locator('button:has-text(":")').first()).toBeVisible();
  await page.locator('button:has-text(":")').first().click();
  await page.locator('button[type="submit"]').click();

  await expect(page.getByText("Quelques informations")).toBeVisible();

  await page.fill('input[autocomplete="given-name"]', "Camille");
  await page.fill('input[autocomplete="family-name"]', "TestP32");
  await page.fill('input[autocomplete="tel"]', "0612345678");
  await page.locator('input[autocomplete="email"]').fill("camille-p32@example.com");
  await page.locator('input[autocomplete="email"]').blur();

  const addressInput = page.getByLabel("Adresse", { exact: false }).and(page.locator('input[role="combobox"]'));
  await addressInput.fill("1 rue de Test");
  await page.waitForTimeout(600);
  await page.getByLabel("Code postal").fill("76400");
  await page.getByLabel("Ville").fill(testCityName);
  await page.getByLabel("Ville").blur();
}

test.describe("Réservation publique — bandeau « déjà dans le secteur ce jour-là » (Phase 3.2)", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async () => {
    await cleanup();
    await seed();
    await overrideAvailabilityForTargetDays();
  });

  test.afterAll(async () => {
    await cleanup();
    await restoreAvailability();
  });

  test("affiche le message spécifique quand l'adresse correspond à une zone qui passe le jour choisi", async ({ page }) => {
    await bookUntilAddressStep(page, tourDate);
    await expect(page.getByText(`✓ Vous êtes déjà dans notre secteur ce jour-là — ${testZoneName}, passage régulier le ${tourWeekday.toLocaleLowerCase("fr-FR")}.`)).toBeVisible();
  });

  test("affiche le message générique quand l'adresse correspond à une zone qui ne passe pas ce jour-là", async ({ page }) => {
    await bookUntilAddressStep(page, sameZoneOtherDayDate);
    await expect(page.getByText(`✓ ${testZoneName} — passage régulier le ${tourWeekday.toLocaleLowerCase("fr-FR")}`)).toBeVisible();
    await expect(page.getByText("Vous êtes déjà dans notre secteur ce jour-là")).toHaveCount(0);
  });
});
