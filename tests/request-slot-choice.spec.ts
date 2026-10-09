import { expect, test, type Page } from "./helpers/test";
import { config } from "dotenv";
import { neon } from "./helpers/sql";

config({ path: ".env.local" });
const sql = neon(process.env.DATABASE_URL!);

/**
 * Demande à plusieurs horaires, côté professionnel (chantier C8, phase 3) :
 * les horaires proposés apparaissent en blocs provisoires dans l'agenda, il
 * en retient un (les autres se libèrent), ne peut pas poser lui-même un
 * rendez-vous sur une option, et un refus libère tout.
 *
 * Demande, fiche et rendez-vous de test supprimés à la fin.
 */
const SLUG = "pauline-faucillon";
const SERVICE = "Ostéopathie canine";
const REQUEST_ID = "e2e-slot-choice-request";
const CLIENT_ID = "e2e-slot-choice-client";
const ANIMAL_ID = "e2e-slot-choice-animal";
const REQUESTER = "Odile Options";

type Slot = { date: string; start: string };
let slots: Slot[] = [];
let duration = 60;

async function cleanup() {
  await sql`DELETE FROM "Appointment" WHERE id = ${REQUEST_ID} OR "clientId" = ${CLIENT_ID}`;
  await sql`DELETE FROM "Animal" WHERE id = ${ANIMAL_ID}`;
  await sql`DELETE FROM "Client" WHERE id = ${CLIENT_ID}`;
}

/** Une demande en attente proposant les trois horaires, dans cet ordre. */
async function insertRequest() {
  await sql`DELETE FROM "Appointment" WHERE id = ${REQUEST_ID}`;
  await sql`INSERT INTO "Appointment" (id, date, start, duration, "clientName", "animalName", "serviceName", mode, location, price, status, notes, "updatedAt")
    VALUES (${REQUEST_ID}, ${`${slots[0].date}T00:00:00.000Z`}, ${slots[0].start}, ${duration}, ${REQUESTER}, 'Tirelire', ${SERVICE}, 'CABINET', 'Cabinet', 60, 'PENDING', '', now())`;
  for (const [index, slot] of slots.entries()) {
    await sql`INSERT INTO "AppointmentSlotOption" (id, "appointmentId", date, start, rank) VALUES (${`${REQUEST_ID}-${index + 1}`}, ${REQUEST_ID}, ${`${slot.date}T00:00:00.000Z`}, ${slot.start}, ${index + 1})`;
  }
}

async function openSchedule(page: Page) {
  await page.addInitScript(() => sessionStorage.clear());
  await page.goto(`/reserver/${SLUG}`);
  await page.getByText(SERVICE).first().click();
  await page.getByText("Au cabinet", { exact: true }).click();
  await page.getByRole("button", { name: "Continuer" }).click();
  await expect(page.locator('[role="gridcell"][aria-disabled="false"]').first()).toBeVisible();
}

async function slotsOn(page: Page, dateId: string): Promise<string[]> {
  await page.locator(`[role="gridcell"][data-date="${dateId}"]`).click();
  await page.waitForTimeout(500);
  return (await page.locator("button", { hasText: /^\d{2}:\d{2}$/ }).allTextContents()).map((text) => text.trim());
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ browser }) => {
  await cleanup();
  const [service] = await sql`SELECT duration FROM "Service" WHERE name = ${SERVICE} AND "organizationId" = 'org-1002-pattes' LIMIT 1`;
  duration = service.duration as number;
  // Trois créneaux réellement libres : le premier et le dernier d'un jour, le premier du jour suivant.
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  await openSchedule(page);
  const days = page.locator('[role="gridcell"][aria-disabled="false"]');
  const dayOne = (await days.nth(0).getAttribute("data-date"))!;
  const dayTwo = (await days.nth(1).getAttribute("data-date"))!;
  const first = await slotsOn(page, dayOne);
  const second = await slotsOn(page, dayTwo);
  slots = [{ date: dayOne, start: first[0] }, { date: dayOne, start: first[first.length - 1] }, { date: dayTwo, start: second[0] }];
  await context.close();
  await sql`INSERT INTO "Client" (id, "firstName", "lastName", phone, email, city, address, "updatedAt") VALUES (${CLIENT_ID}, 'Interne', 'Rendezvous', '', '', 'Rouen', '', now())`;
  await sql`INSERT INTO "Animal" (id, "clientId", name, species, breed, age, weight, sex, avatar, "avatarBackground", history, conditions, treatments, notes, "updatedAt") VALUES (${ANIMAL_ID}, ${CLIENT_ID}, 'Bidule', 'Chien', '', '', '', '', '', '', '', '', '', '', now())`;
});

test.afterAll(cleanup);

test("un rendez-vous interne posé sur une option est refusé, en nommant la demande", async ({ page }) => {
  await insertRequest();
  await page.goto(`/dashboard/clients/${CLIENT_ID}`);
  await page.getByRole("button", { name: "Nouveau rendez-vous" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Nouveau rendez-vous" });
  await dialog.getByRole("button", { name: "Cabinet", exact: true }).click();
  await dialog.getByLabel("Date", { exact: true }).fill(slots[2].date);
  await dialog.getByLabel("Heure", { exact: true }).fill(slots[2].start);
  await dialog.getByRole("button", { name: "Créer le rendez-vous" }).click();
  await expect(dialog.getByRole("alert")).toContainText(`Ce créneau est réservé en option par la demande de ${REQUESTER} — répondez-y d’abord.`);
  const [count] = await sql`SELECT count(*)::int AS n FROM "Appointment" WHERE "clientId" = ${CLIENT_ID}`;
  expect(count.n).toBe(0);
});

test("l'agenda montre les options en blocs provisoires ; retenir le 2e choix libère les autres", async ({ page, browser }) => {
  await insertRequest();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/dashboard/agenda?date=${slots[0].date}`, { waitUntil: "networkidle" });

  // Le panneau des demandes : pas d'« Accepter », les horaires à retenir.
  const requestCard = page.locator("article").filter({ hasText: REQUESTER }).first();
  await expect(requestCard).toContainText("3 horaires proposés");
  await expect(requestCard.getByRole("button", { name: "Accepter", exact: true })).toHaveCount(0);
  await expect(requestCard.getByRole("button", { name: /^Retenir le/ })).toHaveCount(3);

  // Le planning : un bloc par horaire proposé.
  const second = page.locator("[data-testid='agenda-event'][data-option='2/3']");
  await expect(page.locator("[data-testid='agenda-event'][data-option='1/3']")).toBeVisible();
  await expect(second).toContainText("Option 2/3");
  await second.evaluate((element) => element.scrollIntoView({ block: "center" }));
  await second.click();
  const sheet = page.getByRole("dialog", { name: "Rendez-vous de Tirelire" });
  await expect(sheet.getByRole("region", { name: "Horaires proposés pour Tirelire" })).toContainText("2e choix");
  await sheet.getByRole("button", { name: /^Retenir le 2e choix/ }).click();
  await expect(page.getByText(/Rendez-vous de Tirelire confirmé/)).toBeVisible({ timeout: 15000 });

  const [request] = await sql`SELECT status::text AS status, to_char(date, 'YYYY-MM-DD') AS date, start FROM "Appointment" WHERE id = ${REQUEST_ID}`;
  expect([request.status, request.date, request.start]).toEqual(["CONFIRMED", slots[1].date, slots[1].start]);
  const [options] = await sql`SELECT count(*)::int AS n FROM "AppointmentSlotOption" WHERE "appointmentId" = ${REQUEST_ID}`;
  expect(options.n, "toutes les options sont supprimées").toBe(0);
  const [audit] = await sql`SELECT metadata FROM "AuditLog" WHERE "entityId" = ${REQUEST_ID} AND action = 'APPOINTMENT_STATUS_CHANGED' ORDER BY "createdAt" DESC LIMIT 1`;
  expect(audit.metadata).toEqual({ status: "confirmed", chosenRank: 2, proposed: 3 });

  // Les deux autres horaires sont de nouveau proposés au public.
  const visitor = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  try {
    const other = await visitor.newPage();
    await openSchedule(other);
    expect(await slotsOn(other, slots[0].date)).toContain(slots[0].start);
    expect(await slotsOn(other, slots[2].date)).toContain(slots[2].start);
  } finally {
    await visitor.close();
  }
});

test("refuser une demande à plusieurs horaires libère ses options", async ({ page }) => {
  await insertRequest();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/dashboard/agenda?date=${slots[0].date}`, { waitUntil: "networkidle" });
  await page.locator("article").filter({ hasText: REQUESTER }).first().getByRole("button", { name: "Refuser", exact: true }).click();
  await expect.poll(async () => (await sql`SELECT status::text AS status FROM "Appointment" WHERE id = ${REQUEST_ID}`)[0].status).toBe("CANCELLED");
  const [options] = await sql`SELECT count(*)::int AS n FROM "AppointmentSlotOption" WHERE "appointmentId" = ${REQUEST_ID}`;
  expect(options.n).toBe(0);
  await expect(page.locator("[data-testid='agenda-event'][data-option]")).toHaveCount(0);
});
