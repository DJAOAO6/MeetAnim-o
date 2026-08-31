import { config } from "dotenv";
import { expect, test, type Page } from "@playwright/test";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.local" });

/**
 * Refonte tournées, phase 3.1 : sur l'écran d'exécution d'une tournée, un
 * bloc croise les rappels dus/proches de l'échéance dans la zone avec les
 * créneaux encore libres à la prochaine occurrence, et permet d'envoyer une
 * campagne groupée (réutilise dispatchReminderEmails / reminderEmailTemplate
 * — pas de second système d'envoi).
 */

const testEmail = "praticien-test@pf-osteo-animale.fr";
const testPassword = "Praticien-Test-2026!";

const testZoneId = "tmp-p31-zone";
const testCityId = "tmp-p31-city";
const testTourId = "tmp-p31-tour";
const testCityName = "VilleTestP31";
const testZoneName = "Zone E2E Fill P3.1";

const clientReminderId = "tmp-p31-client-reminder";
const animalReminderId = "tmp-p31-animal-reminder";
const reminderId = "tmp-p31-reminder";

const clientBlockerId = "tmp-p31-client-blocker";
const animalBlockerId = "tmp-p31-animal-blocker";
const appointmentBlockerId = "tmp-p31-appt-blocker";

const weekdayLabels = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];

// Une date future fixe (tournée "Une seule fois") plutôt qu'aujourd'hui :
// cette base de dev porte de vrais rendez-vous sur les jours proches
// d'aujourd'hui, qui fausseraient le calcul de créneaux libres.
function futureDateId(): string {
  const date = new Date();
  date.setDate(date.getDate() + 61);
  return date.toISOString().slice(0, 10);
}

function weekdayLabelFor(dateId: string): string {
  return weekdayLabels[new Date(`${dateId}T12:00:00.000Z`).getDay()];
}

const dateId = futureDateId();
const weekday = weekdayLabelFor(dateId);

type StoredBusinessProfile = { id: string; availability: unknown };
let originalProfile: StoredBusinessProfile | null = null;

/**
 * Les disponibilités réelles du praticien sont des données de dev
 * arbitraires — pour un test déterministe (nombre exact de créneaux
 * libres), on les remplace temporairement, uniquement pour le jour testé, le
 * temps du test, puis on restaure l'original en afterAll (même schéma que
 * grantPermission/revokePermission dans tour-execution-swap.spec.ts).
 */
async function overrideAvailabilityForTestDay() {
  const sql = neon(process.env.DATABASE_URL!);
  const [row] = await sql`SELECT id, availability FROM "BusinessProfile" LIMIT 1`;
  if (!row) throw new Error("Aucun BusinessProfile en base — prérequis du test.");
  originalProfile = { id: row.id, availability: row.availability };

  const availability = row.availability as {
    days: Array<{ id: string; label: string; enabled: boolean; slots: Array<{ id: string; start: string; end: string; cabinet: boolean; home: boolean }> }>;
    defaultAppointmentDuration: number;
    slotInterval: number;
  };
  const nextDays = availability.days.map((day) =>
    day.label === weekday
      ? { ...day, enabled: true, slots: [{ id: "tmp-p31-slot", start: "08:00", end: "20:00", cabinet: true, home: true }] }
      : day,
  );
  const nextAvailability = { ...availability, days: nextDays, defaultAppointmentDuration: 60, slotInterval: 60 };
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
  await sql`INSERT INTO "City" (id, name, "postalCode", "zoneId") VALUES (${testCityId}, ${testCityName}, '76300', ${testZoneId})`;
  await sql`
    INSERT INTO "Tour" (id, name, recurrence, day, "dateId", "dateLabel", "startTime", "endTime", "zoneId", status)
    VALUES (${testTourId}, 'Tournée E2E Fill P3.1', 'Une seule fois', ${weekday}, ${dateId}, 'test', '08:00', '20:00', ${testZoneId}, 'ACTIVE')
  `;

  // Client dont le rappel est dû, dans la zone de la tournée.
  await sql`INSERT INTO "Client" (id, "firstName", "lastName", phone, email, city, address, "updatedAt") VALUES (${clientReminderId}, 'Prénom', 'E2EFillP31', '', 'p31-fill-reminder@example.fr', ${testCityName}, '1 rue Test', now())`;
  await sql`INSERT INTO "Animal" (id, "clientId", name, species, breed, age, weight, sex, avatar, "avatarBackground", history, conditions, treatments, notes, "updatedAt") VALUES (${animalReminderId}, ${clientReminderId}, 'P31FillAnimal', 'Chien', '', '', '', '', '', '', '', '', '', '', now())`;
  const todayId = new Date().toISOString().slice(0, 10);
  await sql`INSERT INTO "Reminder" (id, "clientId", "animalId", "lastConsultation", delay, "dueDate", status, "updatedAt") VALUES (${reminderId}, ${clientReminderId}, ${animalReminderId}, now(), 'SIX_MONTHS', ${todayId}::date, 'DUE', now())`;

  // Un rendez-vous cabinet à 10:00 ce jour-là (peu importe la zone) occupe
  // exactement un créneau de la fenêtre horaire de la tournée, pour un
  // compte de créneaux libres déterministe.
  await sql`INSERT INTO "Client" (id, "firstName", "lastName", phone, email, city, address, "updatedAt") VALUES (${clientBlockerId}, 'Prénom', 'E2EFillP31Blocker', '', 'p31-fill-blocker@example.fr', 'Rouen', '9 rue Test', now())`;
  await sql`INSERT INTO "Animal" (id, "clientId", name, species, breed, age, weight, sex, avatar, "avatarBackground", history, conditions, treatments, notes, "updatedAt") VALUES (${animalBlockerId}, ${clientBlockerId}, 'P31FillBlockerAnimal', 'Chien', '', '', '', '', '', '', '', '', '', '', now())`;
  await sql`
    INSERT INTO "Appointment" (id, "clientId", "animalId", "clientName", "animalName", "serviceName", date, start, duration, mode, location, price, status, notes, "createdAt", "updatedAt")
    VALUES (${appointmentBlockerId}, ${clientBlockerId}, ${animalBlockerId}, 'Prénom E2EFillP31Blocker', 'P31FillBlockerAnimal', 'Ostéopathie E2E P31', ${dateId}::date, '10:00', 60, 'CABINET', 'Cabinet', 60, 'CONFIRMED', '', now(), now())
  `;
}

async function cleanup() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`DELETE FROM "AuditLog" WHERE "entityId" = ${reminderId}`;
  await sql`DELETE FROM "Reminder" WHERE id = ${reminderId}`;
  await sql`DELETE FROM "Appointment" WHERE id = ${appointmentBlockerId}`;
  await sql`DELETE FROM "Animal" WHERE id IN (${animalReminderId}, ${animalBlockerId})`;
  await sql`DELETE FROM "Client" WHERE id IN (${clientReminderId}, ${clientBlockerId})`;
  await sql`DELETE FROM "Tour" WHERE id = ${testTourId}`;
  await sql`DELETE FROM "City" WHERE "zoneId" = ${testZoneId}`;
  await sql`DELETE FROM "Zone" WHERE id = ${testZoneId}`;
}

async function login(page: Page) {
  await page.goto("/login");
  await page.fill('input[type="email"]', testEmail);
  await page.fill('input[type="password"]', testPassword);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard**", { timeout: 10000 });
}

async function openTourExecution(page: Page) {
  await page.goto("/dashboard/tournees");
  await page.waitForTimeout(600);
  const heading = page.getByText("Tournée E2E Fill P3.1", { exact: true });
  await heading.scrollIntoViewIfNeeded();
  const card = heading.locator("xpath=ancestor::*[contains(@class,'rounded-')][1]");
  await card.getByRole("button", { name: "Voir la journée" }).click();
  await expect(page.getByText(testZoneName, { exact: false })).toBeVisible();
}

test.describe("Mode tournée — bloc de remplissage rappels/créneaux (Phase 3.1)", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async () => {
    await overrideAvailabilityForTestDay();
  });

  test.afterAll(async () => {
    await cleanup();
    await restoreAvailability();
  });

  test("affiche le nombre de rappels dus et de créneaux libres dans la zone, puis envoie la campagne groupée", async ({ page }) => {
    await cleanup();
    await seed();
    await login(page);
    await openTourExecution(page);

    // Fenêtre 08:00-20:00, créneaux d'1h : 12 créneaux bruts, 1 occupé par
    // le rendez-vous cabinet de 10:00 → 11 libres.
    await expect(page.getByText(`1 rappel dû dans la zone ${testZoneName} · 11 créneaux libres ${weekday.toLocaleLowerCase("fr-FR")}`)).toBeVisible();

    await page.getByRole("button", { name: "Proposer un rendez-vous" }).click();
    await expect(page.getByText("1 proposition de rendez-vous envoyée.")).toBeVisible({ timeout: 10000 });

    const sql = neon(process.env.DATABASE_URL!);
    const [reminder] = await sql`SELECT status FROM "Reminder" WHERE id = ${reminderId}`;
    expect(reminder.status).toBe("SENT");

    const [auditLog] = await sql`SELECT action, metadata FROM "AuditLog" WHERE "entityId" = ${reminderId} AND action = 'REMINDER_SENT'`;
    expect(auditLog).toBeTruthy();
    expect(auditLog.metadata?.source).toBe("tour-zone");

    // Le bloc disparaît une fois le seul rappel de la zone traité (plus de
    // rappel dû → plus d'occasion à afficher).
    await expect(page.getByText(/rappel dû dans la zone/)).toHaveCount(0);
  });
});
