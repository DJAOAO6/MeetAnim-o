import { expect, test, type Page } from "./helpers/test";
import { config } from "dotenv";
import { neon } from "./helpers/sql";

config({ path: ".env.local" });
const sql = neon(process.env.DATABASE_URL!);

/**
 * Réservation publique à plusieurs horaires (chantier C8, phase 2) : la case
 * n'existe que si le cabinet l'a permis ; le client propose 3 horaires sur 2
 * jours, la demande part avec ses options, et un second visiteur ne voit
 * plus ces créneaux.
 *
 * Réglages rétablis, demande et fiche de test supprimées à la fin.
 */
const SLUG = "pauline-faucillon";
const SERVICE = "Ostéopathie canine";
const EMAIL = "multi-horaires-e2e@example.fr";
let savedAvailability: unknown = null;

async function setMultiple(enabled: boolean) {
  await sql`UPDATE "BusinessProfile" SET availability = ${JSON.stringify({ ...(savedAvailability as object), allowMultipleSlotRequests: enabled })}::jsonb WHERE slug = ${SLUG}`;
}

async function cleanup() {
  await sql`DELETE FROM "Appointment" WHERE "clientName" = 'Multi Horaires'`;
  await sql`DELETE FROM "Animal" WHERE "clientId" IN (SELECT id FROM "Client" WHERE email = ${EMAIL})`;
  await sql`DELETE FROM "Client" WHERE email = ${EMAIL}`;
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await cleanup();
  const [profile] = await sql`SELECT availability FROM "BusinessProfile" WHERE slug = ${SLUG}`;
  savedAvailability = profile.availability;
});

test.afterAll(async () => {
  await cleanup();
  if (savedAvailability) await sql`UPDATE "BusinessProfile" SET availability = ${JSON.stringify(savedAvailability)}::jsonb WHERE slug = ${SLUG}`;
});

async function openSchedule(page: Page) {
  await page.addInitScript(() => sessionStorage.clear());
  await page.goto(`/reserver/${SLUG}`);
  await page.getByText(SERVICE).first().click();
  await page.getByText("Au cabinet", { exact: true }).click();
  await page.getByRole("button", { name: "Continuer" }).click();
  await expect(page.locator('[role="gridcell"][aria-disabled="false"]').first()).toBeVisible();
}

const slotButtons = (page: Page) => page.locator("button", { hasText: /^\d{2}:\d{2}$/ });

async function slotsOn(page: Page, dateId: string): Promise<string[]> {
  await page.locator(`[role="gridcell"][data-date="${dateId}"]`).click();
  await page.waitForTimeout(500);
  return (await slotButtons(page).allTextContents()).map((text) => text.trim());
}

test("réglage désactivé : pas de case « plusieurs horaires »", async ({ page }) => {
  await setMultiple(false);
  await openSchedule(page);
  await expect(page.getByLabel("Je suis disponible à plusieurs horaires")).toHaveCount(0);
});

test("3 horaires sur 2 jours : la demande part avec ses options, et les créneaux sont pris pour les suivants", async ({ page, browser }) => {
  test.setTimeout(120_000);
  await setMultiple(true);
  await openSchedule(page);
  await page.getByLabel("Je suis disponible à plusieurs horaires").check();

  const days = page.locator('[role="gridcell"][aria-disabled="false"]');
  const dayOne = (await days.nth(0).getAttribute("data-date"))!;
  const dayTwo = (await days.nth(1).getAttribute("data-date"))!;
  const firstDaySlots = await slotsOn(page, dayOne);
  await slotButtons(page).filter({ hasText: firstDaySlots[0] }).first().click();
  await slotButtons(page).filter({ hasText: firstDaySlots[1] }).first().click();
  const secondDaySlots = await slotsOn(page, dayTwo);
  await slotButtons(page).filter({ hasText: secondDaySlots[0] }).first().click();

  const chosen = page.getByRole("region", { name: "Vos horaires" });
  await expect(chosen.getByRole("listitem")).toHaveCount(3);
  await expect(chosen.getByRole("listitem").first()).toContainText("1er choix");
  // Trois horaires : les autres attendent qu'on en retire un.
  await expect(slotButtons(page).filter({ hasText: secondDaySlots[1] }).first()).toBeDisabled();
  await expect(chosen.getByRole("status")).toContainText("Vous avez choisi 3 horaires");

  await page.getByRole("button", { name: "Continuer" }).click();
  await page.locator("#booking-details-firstName").fill("Multi");
  await page.locator("#booking-details-lastName").fill("Horaires");
  await page.locator('input[autocomplete="tel"]').fill("0612345678");
  await page.locator('input[type="email"]').fill(EMAIL);
  await page.getByText("Adresse", { exact: true }).click();
  await page.locator("#booking-details-address").fill("1 rue des Horaires");
  await page.locator("#booking-details-postalCode").fill("76000");
  await page.locator("#booking-details-city").fill("Rouen");
  await page.getByText("Votre animal", { exact: true }).click();
  await page.locator("#booking-details-animalName").fill("Trinome");
  await page.locator("#booking-details-reason").fill("Disponible à plusieurs horaires.");
  await page.getByRole("button", { name: "Continuer" }).click();

  await expect(page.getByText("3e choix")).toBeVisible();
  await expect(page.getByText(/retiendra l’un de ces 3 horaires/)).toBeVisible();
  await page.locator('input[type="checkbox"]').check();
  await page.getByRole("button", { name: "Réserver mon rendez-vous" }).click();
  await expect(page.getByText("Votre demande porte sur 3 horaires.")).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole("link", { name: "Google Agenda" }), "pas d'agenda tant qu'aucun horaire n'est retenu").toHaveCount(0);

  const [request] = await sql`SELECT id, date::date AS date, start, status::text AS status FROM "Appointment" WHERE "clientName" = 'Multi Horaires'`;
  expect([request.status, request.start]).toEqual(["PENDING", firstDaySlots[0]]);
  const options = await sql`SELECT to_char(date, 'YYYY-MM-DD') AS date, start, rank FROM "AppointmentSlotOption" WHERE "appointmentId" = ${request.id} ORDER BY rank`;
  expect(options.map((row) => [row.date, row.start, row.rank])).toEqual([[dayOne, firstDaySlots[0], 1], [dayOne, firstDaySlots[1], 2], [dayTwo, secondDaySlots[0], 3]]);

  // Un second visiteur ne voit plus ces trois créneaux.
  const visitor = await browser.newContext();
  try {
    const other = await visitor.newPage();
    await openSchedule(other);
    const nowFirst = await slotsOn(other, dayOne);
    expect(nowFirst).not.toContain(firstDaySlots[0]);
    expect(nowFirst).not.toContain(firstDaySlots[1]);
    expect(await slotsOn(other, dayTwo)).not.toContain(secondDaySlots[0]);
  } finally {
    await visitor.close();
  }
});
