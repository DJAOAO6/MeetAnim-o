import { expect, test, type Page } from "./helpers/test";
import { neon } from "./helpers/sql";
import { config } from "dotenv";

config({ path: ".env.local" });
const sql = neon(process.env.DATABASE_URL!);

/**
 * Pause après un rendez-vous (chantier C2, phase 2), vue par le client qui
 * réserve. Pause de 15 min, rendez-vous déjà pris au cabinet de 10:00 à
 * 10:50, prestation de 45 min, un créneau toutes les 15 min :
 * - 10:45 et 11:00 tombent sur le rendez-vous ou sa pause (jusqu'à 11:05) ;
 * - 09:15 finirait à 10:00, mais sa propre pause empiéterait sur 10:00 ;
 * - 09:00 et 11:15 restent proposés.
 *
 * Les disponibilités du profil de démonstration sont remplacées le temps du
 * test, puis rétablies : la base est celle du serveur local.
 */
const SLUG = "pauline-faucillon";
const CLIENT = "E2E-Pause";
const FRENCH_MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const WEEKDAYS = [["monday", "Lundi"], ["tuesday", "Mardi"], ["wednesday", "Mercredi"], ["thursday", "Jeudi"], ["friday", "Vendredi"], ["saturday", "Samedi"], ["sunday", "Dimanche"]];

const target = new Date();
target.setDate(target.getDate() + 40);
const TARGET_ID = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, "0")}-${String(target.getDate()).padStart(2, "0")}`;

let savedAvailability: unknown = null;

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  const [row] = await sql`SELECT availability FROM "BusinessProfile" WHERE slug = ${SLUG}`;
  savedAvailability = row.availability;
  const days = WEEKDAYS.map(([id, label]) => ({ id, label, enabled: true, slots: [{ id: `${id}-1`, start: "09:00", end: "18:00", cabinet: true, home: true }] }));
  const next = { ...(savedAvailability as object), days, closures: [], vacations: [], slotInterval: 15, breakAfterAppointment: 15 };
  await sql`UPDATE "BusinessProfile" SET availability = ${JSON.stringify(next)}::jsonb WHERE slug = ${SLUG}`;
  await sql`DELETE FROM "Appointment" WHERE "clientName" = ${CLIENT}`;
  await sql`INSERT INTO "Appointment" (id, date, start, duration, "clientName", "animalName", "serviceName", mode, location, price, status, notes, "createdAt", "updatedAt")
    VALUES (${`e2e-pause-${Date.now()}`}, ${`${TARGET_ID}T00:00:00.000Z`}, '10:00', 50, ${CLIENT}, 'Rex', 'Séance', 'CABINET', 'Cabinet', 0, 'CONFIRMED', '', now(), now())`;
});

test.afterAll(async () => {
  await sql`DELETE FROM "Appointment" WHERE "clientName" = ${CLIENT}`;
  await sql`UPDATE "BusinessProfile" SET availability = ${savedAvailability === null ? null : JSON.stringify(savedAvailability)}::jsonb WHERE slug = ${SLUG}`;
});

async function displayedMonth(page: Page): Promise<Date> {
  const label = await page.locator('[role="grid"]').getAttribute("aria-label");
  const match = /Calendrier, (\p{L}+) (\d{4})/u.exec(label ?? "");
  if (!match) throw new Error(`Mois affiché non reconnu dans "${label}"`);
  return new Date(Number(match[2]), FRENCH_MONTHS.indexOf(match[1].toLocaleLowerCase("fr-FR")), 1);
}

test("la pause après un rendez-vous retire les créneaux des deux côtés", async ({ page }) => {
  await page.addInitScript(() => sessionStorage.clear());
  await page.goto(`/reserver/${SLUG}`);
  await expect(page.getByText("Quelle consultation souhaitez-vous")).toBeVisible();
  await page.locator("button[aria-pressed]").filter({ hasText: "Massage canin" }).click();
  await page.getByRole("button", { name: "Consultation au cabinet", exact: true }).click();
  await page.locator('button[type="submit"]').click();
  await expect(page.getByText("Choisissez votre créneau")).toBeVisible();

  const current = await displayedMonth(page);
  const monthsAhead = (target.getFullYear() - current.getFullYear()) * 12 + (target.getMonth() - current.getMonth());
  for (let i = 0; i < monthsAhead; i += 1) {
    await page.getByRole("button", { name: "Mois suivant" }).click();
    await page.waitForTimeout(150);
  }
  await page.getByRole("gridcell", { name: new RegExp(`\\b${target.getDate()} ${FRENCH_MONTHS[target.getMonth()]} ${target.getFullYear()}`) }).click();
  await expect(page.getByText("Choisissez une heure")).toBeVisible();

  const slotButton = (time: string) => page.getByRole("button", { name: new RegExp(`^${time}`) });
  await expect(slotButton("11:15")).toBeVisible();
  await expect(slotButton("09:00")).toBeVisible();
  for (const taken of ["09:15", "09:30", "10:00", "10:45", "11:00"]) {
    await expect(slotButton(taken), `${taken} ne doit pas être proposé`).toHaveCount(0);
  }
});
