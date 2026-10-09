import { expect, test, type Page } from "./helpers/test";
import { config } from "dotenv";
import { neon } from "./helpers/sql";

config({ path: ".env.local" });
const sql = neon(process.env.DATABASE_URL!);

/**
 * Demandes à plusieurs horaires (chantier C8, phase 1) : un horaire proposé
 * par une demande en attente est occupé — pour la page publique comme pour
 * la fenêtre de rendez-vous du professionnel — et se libère quand la
 * demande est annulée.
 *
 * La demande de test est supprimée à la fin.
 */
const REQUEST_ID = "e2e-slot-lock-request";
const SERVICE = "Ostéopathie canine";

async function cleanup() {
  await sql`DELETE FROM "Appointment" WHERE id = ${REQUEST_ID}`;
}

test.describe.configure({ mode: "serial" });
test.beforeAll(cleanup);
test.afterAll(cleanup);

/** Page publique, au cabinet, à l'étape du créneau. */
async function openSchedule(page: Page) {
  await page.addInitScript(() => sessionStorage.clear());
  await page.goto("/reserver/pauline-faucillon");
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

test("un horaire proposé par une demande en attente est occupé, puis libéré à l'annulation", async ({ page }) => {
  await openSchedule(page);
  const cell = page.locator('[role="gridcell"][aria-disabled="false"]').first();
  const dateId = (await cell.getAttribute("data-date"))!;
  const before = await slotsOn(page, dateId);
  const time = before[0];
  expect(time, "un créneau libre ce jour-là").toBeTruthy();

  // Une demande en attente : son premier choix ailleurs, son 2e choix sur ce créneau.
  const [service] = await sql`SELECT duration FROM "Service" WHERE name = ${SERVICE} AND "organizationId" = 'org-1002-pattes' LIMIT 1`;
  const far = new Date(Date.now() + 50 * 24 * 3600_000).toISOString().slice(0, 10);
  await sql`INSERT INTO "Appointment" (id, date, start, duration, "clientName", "animalName", "serviceName", mode, location, price, status, notes, "updatedAt")
    VALUES (${REQUEST_ID}, ${`${far}T00:00:00.000Z`}, '08:00', ${service.duration}, 'E2E Options', 'Rex', ${SERVICE}, 'CABINET', 'Cabinet', 60, 'PENDING', '', now())`;
  await sql`INSERT INTO "AppointmentSlotOption" (id, "appointmentId", date, start, rank) VALUES (${`${REQUEST_ID}-1`}, ${REQUEST_ID}, ${`${far}T00:00:00.000Z`}, '08:00', 1), (${`${REQUEST_ID}-2`}, ${REQUEST_ID}, ${`${dateId}T00:00:00.000Z`}, ${time}, 2)`;

  // Page publique : le créneau n'est plus proposé.
  await openSchedule(page);
  expect(await slotsOn(page, dateId), "verrouillé par l'option").not.toContain(time);

  // Fenêtre de rendez-vous du professionnel : le créneau est signalé occupé.
  await page.goto("/dashboard/agenda", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Nouveau rendez-vous" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Nouveau rendez-vous" });
  await dialog.getByRole("button", { name: "Cabinet", exact: true }).click();
  await dialog.getByLabel("Date", { exact: true }).fill(dateId);
  await dialog.getByLabel("Heure", { exact: true }).fill(time);
  await expect(dialog.getByRole("status").filter({ hasText: "Conflit avec un rendez-vous existant" })).toBeVisible({ timeout: 10000 });

  // Demande annulée : l'horaire se libère.
  await sql`UPDATE "Appointment" SET status = 'CANCELLED' WHERE id = ${REQUEST_ID}`;
  await openSchedule(page);
  expect(await slotsOn(page, dateId)).toContain(time);
});
