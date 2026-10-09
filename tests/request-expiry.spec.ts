import { expect, test } from "./helpers/test";
import { config } from "dotenv";
import { neon } from "./helpers/sql";
import { BASE_URL } from "./helpers/base-url";

config({ path: ".env.local" });
const sql = neon(process.env.DATABASE_URL!);

/**
 * Expiration des demandes à plusieurs horaires (chantier C8, phase 4) : la
 * tâche planifiée, appelée comme le fait le planificateur (route cron et son
 * secret). Sans réponse au bout de 72 h, ou à moins de 24 h du premier
 * horaire proposé, la demande est annulée et ses horaires se libèrent.
 *
 * Nécessite CRON_SECRET, le même que celui du serveur de test : sans lui,
 * ignoré plutôt que faussement rouge. Demandes et fiche de test supprimées à
 * la fin.
 */
const secret = process.env.CRON_SECRET;
const CLIENT_ID = "e2e-expiry-client";
const REQUESTER = "Edmond Echeance";
const HOUR = 3600_000;

const OLD = "e2e-expiry-old";
const SOON = "e2e-expiry-soon";
const FRESH = "e2e-expiry-fresh";
const WARN = "e2e-expiry-warn";

/** La date et l'heure qu'il est à Paris à cet instant (les horaires sont saisis en heure de Paris). */
function parisParts(instant: Date): { date: string; hour: string } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(instant);
  const get = (type: string) => parts.find((part) => part.type === type)!.value;
  return { date: `${get("year")}-${get("month")}-${get("day")}`, hour: get("hour") };
}

function daysAhead(days: number): string {
  return parisParts(new Date(Date.now() + days * 24 * HOUR)).date;
}

// Des minutes impaires : aucun vrai rendez-vous ne commence à ces heures-là.
const FAR = daysAhead(45);
const FARTHER = daysAhead(46);

async function insertRequest(id: string, ageHours: number, slots: Array<{ date: string; start: string }>, clientId: string | null = null) {
  await sql`INSERT INTO "Appointment" (id, date, start, duration, "clientId", "clientName", "animalName", "serviceName", mode, location, price, status, notes, "createdAt", "updatedAt")
    VALUES (${id}, ${`${slots[0].date}T00:00:00.000Z`}, ${slots[0].start}, 60, ${clientId}, ${REQUESTER}, 'Sablier', 'Ostéopathie canine', 'CABINET', 'Cabinet', 60, 'PENDING', '', ${new Date(Date.now() - ageHours * HOUR).toISOString()}, now())`;
  for (const [index, slot] of slots.entries()) {
    await sql`INSERT INTO "AppointmentSlotOption" (id, "appointmentId", date, start, rank) VALUES (${`${id}-${index + 1}`}, ${id}, ${`${slot.date}T00:00:00.000Z`}, ${slot.start}, ${index + 1})`;
  }
}

async function state(id: string) {
  const [row] = await sql`SELECT status::text AS status, (SELECT count(*)::int FROM "AppointmentSlotOption" o WHERE o."appointmentId" = a.id) AS options FROM "Appointment" a WHERE id = ${id}`;
  return row;
}

async function expiryAudits(id: string) {
  return sql`SELECT metadata, "userId" FROM "AuditLog" WHERE "entityId" = ${id} AND action = 'APPOINTMENT_STATUS_CHANGED' AND metadata->>'expired' = 'true' ORDER BY "createdAt" DESC`;
}

async function runJobs() {
  const response = await fetch(`${BASE_URL}/api/cron/daily`, { headers: { Authorization: `Bearer ${secret}` } });
  expect(response.status).toBe(200);
  return response.json() as Promise<{ requestsExpired: { expired: number; failed: number } }>;
}

async function cleanup() {
  await sql`DELETE FROM "Appointment" WHERE id IN (${OLD}, ${SOON}, ${FRESH}, ${WARN})`;
  await sql`DELETE FROM "Client" WHERE id = ${CLIENT_ID}`;
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await cleanup();
  // Un client avec une adresse (domaine réservé, jamais distribué) : le chemin de l'e-mail est parcouru.
  await sql`INSERT INTO "Client" (id, "firstName", "lastName", phone, email, city, address, "updatedAt") VALUES (${CLIENT_ID}, 'Edmond', 'Echeance', '', 'edmond.echeance@example.test', 'Rouen', '', now())`;
});

test.afterAll(cleanup);

test("dans ses dernières 24 h, la demande dit quand elle expire", async ({ page }) => {
  // Créée il y a 67 h, horaires lointains : l'échéance des 72 h tombe dans 5 h.
  await insertRequest(WARN, 67, [{ date: FAR, start: "10:07" }, { date: FARTHER, start: "10:07" }]);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/dashboard/agenda?date=${FAR}`, { waitUntil: "networkidle" });
  const requestCard = page.locator("article").filter({ hasText: REQUESTER }).first();
  await expect(requestCard).toContainText("2 horaires proposés");
  await expect(requestCard).toContainText("expire dans 5 h");

  // La cloche le dit aussi, à la place de l'heure du seul premier horaire…
  await page.getByRole("button", { name: /^Notifications/ }).first().click();
  const notification = page.getByRole("button", { name: "Masquer la notification de Sablier" }).locator("xpath=ancestor::div[contains(@class,'group')][1]");
  await expect(notification).toContainText("2 horaires");
  await expect(notification).toContainText("expire dans 5 h");
  await page.keyboard.press("Escape");

  // … et la liste du centre de gestion, dans la pastille de statut.
  await page.getByRole("button", { name: /^Gestion des rendez-vous/ }).click();
  const manager = page.getByRole("dialog", { name: "Gestion des rendez-vous" });
  await manager.getByLabel("Filtrer par date").selectOption("all");
  await manager.getByLabel("Filtrer par statut").selectOption("pending");
  await expect(manager.getByRole("listitem").filter({ hasText: REQUESTER })).toContainText("expire dans 5 h");
});

test("sans réponse au bout de 72 h : annulée, horaires libérés, une seule fois", async () => {
  test.skip(!secret, "CRON_SECRET absent");
  await insertRequest(OLD, 73, [{ date: FAR, start: "11:07" }, { date: FAR, start: "14:07" }, { date: FARTHER, start: "11:07" }], CLIENT_ID);
  // Le journal garde les traces des passages précédents de ce test : on compte à partir d'ici.
  const before = (await expiryAudits(OLD)).length;

  const result = await runJobs();
  expect(result.requestsExpired.expired).toBeGreaterThanOrEqual(1);
  expect(result.requestsExpired.failed).toBe(0);
  expect(await state(OLD)).toEqual({ status: "CANCELLED", options: 0 });
  const audits = await expiryAudits(OLD);
  expect(audits).toHaveLength(before + 1);
  expect(audits[0].metadata).toEqual({ status: "cancelled", expired: true, automatic: true });
  expect(audits[0].userId, "personne n'a agi : c'est l'automatisme").toBeNull();

  // Un second passage ne retraite pas la demande (ni e-mail, ni trace en double).
  await runJobs();
  expect(await expiryAudits(OLD)).toHaveLength(before + 1);
});

test("à moins de 24 h du premier horaire proposé : annulée, même toute récente", async () => {
  test.skip(!secret, "CRON_SECRET absent");
  // Le premier horaire tombe dans 19 à 20 h (heure de Paris) ; l'autre est lointain.
  const soon = parisParts(new Date(Date.now() + 20 * HOUR));
  await insertRequest(SOON, 1, [{ date: FARTHER, start: "15:07" }, { date: soon.date, start: `${soon.hour}:07` }]);
  const before = (await expiryAudits(SOON)).length;
  await runJobs();
  expect(await state(SOON)).toEqual({ status: "CANCELLED", options: 0 });
  expect(await expiryAudits(SOON)).toHaveLength(before + 1);
});

test("une demande dans les temps reste en attente, avec tous ses horaires", async () => {
  test.skip(!secret, "CRON_SECRET absent");
  await insertRequest(FRESH, 2, [{ date: FAR, start: "16:07" }, { date: FARTHER, start: "16:07" }]);
  await runJobs();
  expect(await state(FRESH)).toEqual({ status: "PENDING", options: 2 });
  // Celle qui expire dans 5 h aussi : l'échéance n'est pas encore passée.
  expect(await state(WARN)).toEqual({ status: "PENDING", options: 2 });
});
