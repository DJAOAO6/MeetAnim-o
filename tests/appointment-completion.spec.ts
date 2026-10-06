import { expect, test, type Page } from "@playwright/test";
import { config } from "dotenv";
import { neon } from "./helpers/sql";

config({ path: ".env.local" });
const sql = neon(process.env.DATABASE_URL!);

/**
 * Réaliser un rendez-vous (chantier C7) : la consultation est créée une
 * fois, liée au rendez-vous ; repasser le rendez-vous en « annulé » (client
 * absent) la retire.
 *
 * Fiche et rendez-vous de test, supprimés à la fin.
 */
const CLIENT_ID = "e2e-completion-client";
const ANIMAL_ID = "e2e-completion-animal";
const APPOINTMENT_ID = "e2e-completion-appointment";

function mondayAhead(): string {
  const day = new Date(Date.now() + 14 * 24 * 3600_000);
  day.setUTCDate(day.getUTCDate() + ((1 - day.getUTCDay() + 7) % 7));
  return day.toISOString().slice(0, 10);
}
const DAY = mondayAhead();

async function cleanup() {
  await sql`DELETE FROM "Consultation" WHERE "animalId" = ${ANIMAL_ID}`;
  await sql`DELETE FROM "Appointment" WHERE id = ${APPOINTMENT_ID}`;
  await sql`DELETE FROM "Animal" WHERE id = ${ANIMAL_ID}`;
  await sql`DELETE FROM "Client" WHERE id = ${CLIENT_ID}`;
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await cleanup();
  await sql`INSERT INTO "Client" (id, "firstName", "lastName", phone, email, city, address, "updatedAt") VALUES (${CLIENT_ID}, 'Camille', 'Réalisée', '', '', 'Rouen', '', now())`;
  await sql`INSERT INTO "Animal" (id, "clientId", name, species, breed, age, weight, sex, avatar, "avatarBackground", history, conditions, treatments, notes, "updatedAt") VALUES (${ANIMAL_ID}, ${CLIENT_ID}, 'Figue', 'Chien', '', '', '', '', '', '', '', '', '', '', now())`;
  await sql`INSERT INTO "Appointment" (id, date, start, duration, "clientId", "clientName", "animalId", "animalName", "serviceName", mode, location, price, status, notes, "updatedAt")
    VALUES (${APPOINTMENT_ID}, ${`${DAY}T00:00:00.000Z`}, '10:00', 60, ${CLIENT_ID}, 'Camille Réalisée', ${ANIMAL_ID}, 'Figue', 'Séance', 'CABINET', 'Cabinet', 60, 'CONFIRMED', '', now())`;
});

test.afterAll(cleanup);

async function openAppointment(page: Page) {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/dashboard/agenda?date=${DAY}`, { waitUntil: "networkidle" });
  const card = page.locator("[data-testid='agenda-event'][aria-label*='Figue']");
  await card.evaluate((element) => element.scrollIntoView({ block: "center" }));
  await card.click();
  return page.getByRole("dialog", { name: "Rendez-vous de Figue" });
}

test("réaliser crée une consultation liée, une seule", async ({ page }) => {
  const sheet = await openAppointment(page);
  await sheet.getByRole("button", { name: "Consultation réalisée" }).click();
  await expect.poll(async () => (await sql`SELECT status::text AS status FROM "Appointment" WHERE id = ${APPOINTMENT_ID}`)[0].status).toBe("COMPLETED");
  const consultations = await sql`SELECT "appointmentId" FROM "Consultation" WHERE "animalId" = ${ANIMAL_ID}`;
  expect(consultations.map((row) => row.appointmentId)).toEqual([APPOINTMENT_ID]);
});

test("repasser en « Annulé » retire la consultation", async ({ page }) => {
  const sheet = await openAppointment(page);
  await sheet.getByRole("button", { name: "Modifier" }).click();
  await sheet.getByLabel("Statut").selectOption("cancelled");
  await sheet.getByRole("button", { name: "Enregistrer les modifications" }).click();
  await expect.poll(async () => (await sql`SELECT status::text AS status FROM "Appointment" WHERE id = ${APPOINTMENT_ID}`)[0].status).toBe("CANCELLED");
  const [row] = await sql`SELECT "completedAt" FROM "Appointment" WHERE id = ${APPOINTMENT_ID}`;
  expect(row.completedAt).toBeNull();
  const [count] = await sql`SELECT count(*)::int AS n FROM "Consultation" WHERE "animalId" = ${ANIMAL_ID}`;
  expect(count.n, "la consultation du rendez-vous est retirée").toBe(0);
});
