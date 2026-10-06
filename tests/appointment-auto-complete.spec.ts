import { expect, test } from "@playwright/test";
import { config } from "dotenv";
import { neon } from "./helpers/sql";
import { BASE_URL } from "./helpers/base-url";

config({ path: ".env.local" });
const sql = neon(process.env.DATABASE_URL!);

/**
 * « Consultation réalisée » automatique (chantier C7) : la tâche planifiée,
 * appelée comme le fait le planificateur (route cron et son secret).
 *
 * Nécessite CRON_SECRET, le même que celui du serveur de test : sans lui,
 * ignoré plutôt que faussement rouge. Réglages, fiche et rendez-vous de test
 * rétablis à la fin.
 */
const secret = process.env.CRON_SECRET;
const CLIENT_ID = "e2e-auto-client";
const ANIMAL_ID = "e2e-auto-animal";
const SERVICE = "Séance auto E2E";
const YESTERDAY = new Date(Date.now() - 24 * 3600_000).toISOString().slice(0, 10);

let savedSettings: unknown = null;

async function runJobs() {
  const response = await fetch(`${BASE_URL}/api/cron/daily`, { headers: { Authorization: `Bearer ${secret}` } });
  expect(response.status).toBe(200);
  return response.json() as Promise<{ autoCompleted: { completed: number; failed: number } }>;
}

async function setSettings(change: Record<string, unknown>) {
  await sql`UPDATE "BusinessProfile" SET "reminderSettings" = ${JSON.stringify({ ...(savedSettings as object ?? {}), ...change })}::jsonb WHERE "organizationId" = 'org-1002-pattes'`;
}

async function insertAppointment(id: string, start: string) {
  await sql`INSERT INTO "Appointment" (id, date, start, duration, "clientId", "clientName", "animalId", "animalName", "serviceName", mode, location, price, status, notes, "updatedAt")
    VALUES (${id}, ${`${YESTERDAY}T00:00:00.000Z`}, ${start}, 60, ${CLIENT_ID}, 'Auguste Auto', ${ANIMAL_ID}, 'Biscotte', ${SERVICE}, 'CABINET', 'Cabinet', 60, 'CONFIRMED', '', now())`;
}

async function state(id: string) {
  const [row] = await sql`SELECT status::text AS status, "completedAutomatically", (SELECT count(*)::int FROM "Consultation" c WHERE c."appointmentId" = a.id) AS consultations FROM "Appointment" a WHERE id = ${id}`;
  return row;
}

async function cleanup() {
  await sql`DELETE FROM "Consultation" WHERE "animalId" = ${ANIMAL_ID}`;
  await sql`DELETE FROM "Appointment" WHERE "clientId" = ${CLIENT_ID}`;
  await sql`DELETE FROM "Animal" WHERE id = ${ANIMAL_ID}`;
  await sql`DELETE FROM "Client" WHERE id = ${CLIENT_ID}`;
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await cleanup();
  const [profile] = await sql`SELECT "reminderSettings" FROM "BusinessProfile" WHERE "organizationId" = 'org-1002-pattes'`;
  savedSettings = profile.reminderSettings;
  await sql`INSERT INTO "Client" (id, "firstName", "lastName", phone, email, city, address, "updatedAt") VALUES (${CLIENT_ID}, 'Auguste', 'Auto', '', '', 'Rouen', '', now())`;
  await sql`INSERT INTO "Animal" (id, "clientId", name, species, breed, age, weight, sex, avatar, "avatarBackground", history, conditions, treatments, notes, "updatedAt") VALUES (${ANIMAL_ID}, ${CLIENT_ID}, 'Biscotte', 'Chien', '', '', '', '', '', '', '', '', '', '', now())`;
});

test.afterAll(async () => {
  await cleanup();
  await sql`UPDATE "BusinessProfile" SET "reminderSettings" = ${savedSettings === null ? null : JSON.stringify(savedSettings)}::jsonb WHERE "organizationId" = 'org-1002-pattes'`;
});

test("premier passage : la mise en service est notée, rien d'ancien n'est touché", async () => {
  test.skip(!secret, "CRON_SECRET absent");
  await setSettings({ autoCompleteAppointments: true, autoCompleteSince: null });
  await insertAppointment("e2e-auto-first", "09:00");
  await runJobs();
  expect((await state("e2e-auto-first")).status).toBe("CONFIRMED");
  const [profile] = await sql`SELECT "reminderSettings"->>'autoCompleteSince' AS since FROM "BusinessProfile" WHERE "organizationId" = 'org-1002-pattes'`;
  expect(profile.since, "date de mise en service posée").toBeTruthy();
});

test("un rendez-vous confirmé d'hier devient réalisé, sa consultation au dossier ; « Client absent » le défait", async ({ page }) => {
  test.skip(!secret, "CRON_SECRET absent");
  await setSettings({ autoCompleteAppointments: true, autoCompleteSince: new Date(Date.now() - 3 * 24 * 3600_000).toISOString() });
  await insertAppointment("e2e-auto-done", "11:00");

  const result = await runJobs();
  expect(result.autoCompleted.completed).toBeGreaterThanOrEqual(1);
  expect(await state("e2e-auto-done")).toEqual({ status: "COMPLETED", completedAutomatically: true, consultations: 1 });
  // Un second passage ne crée rien de plus.
  await runJobs();
  expect((await state("e2e-auto-done")).consultations).toBe(1);

  // La consultation dans la fiche de l'animal.
  await page.goto(`/dashboard/clients/${CLIENT_ID}?animal=${ANIMAL_ID}`);
  await expect(page.getByText(SERVICE).first()).toBeVisible();

  // Dans l'agenda : la mention, et « Client absent — annuler ».
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/dashboard/agenda?date=${YESTERDAY}`, { waitUntil: "networkidle" });
  const card = page.locator("[data-testid='agenda-event'][aria-label*='Biscotte à 11:00']");
  await card.evaluate((element) => element.scrollIntoView({ block: "center" }));
  await card.click();
  const sheet = page.getByRole("dialog", { name: "Rendez-vous de Biscotte" });
  await expect(sheet).toContainText("Réalisé automatiquement une fois l’heure passée.");
  await sheet.getByRole("button", { name: "Client absent — annuler" }).click();
  const confirm = page.getByRole("dialog", { name: "Client absent ?" });
  await expect(confirm).toContainText("sa consultation est retirée");
  await confirm.getByRole("button", { name: "Annuler le rendez-vous" }).click();
  await expect.poll(async () => (await state("e2e-auto-done")).status).toBe("CANCELLED");
  expect(await state("e2e-auto-done")).toEqual({ status: "CANCELLED", completedAutomatically: false, consultations: 0 });
});

test("réglage désactivé : rien ne change", async () => {
  test.skip(!secret, "CRON_SECRET absent");
  await setSettings({ autoCompleteAppointments: false, autoCompleteSince: new Date(Date.now() - 3 * 24 * 3600_000).toISOString() });
  await insertAppointment("e2e-auto-off", "14:00");
  await runJobs();
  expect(await state("e2e-auto-off")).toEqual({ status: "CONFIRMED", completedAutomatically: false, consultations: 0 });
});
