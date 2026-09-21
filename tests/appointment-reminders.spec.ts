import { expect, test } from "@playwright/test";
import { neon } from "./helpers/sql";
import { config } from "dotenv";

config({ path: ".env.local" });
const sql = neon(process.env.DATABASE_URL!);

/**
 * Rappel automatique des rendez-vous.
 *
 * La fenêtre de rendez-vous annonçait « un rappel par e-mail est envoyé
 * automatiquement 24 heures avant » — et rien ne l'envoyait. Ce test tient
 * la promesse : il déclenche la tâche comme le fait le planificateur, et
 * vérifie en base qui a reçu son rappel.
 *
 * Ce qui compte, dans l'ordre :
 * - le rendez-vous confirmé qui entre dans la fenêtre reçoit son rappel ;
 * - celui qui est trop loin, et la demande pas encore confirmée, non ;
 * - jamais deux fois, même si la tâche tourne de nouveau.
 *
 * Nécessite CRON_SECRET, le même que celui du serveur de test. Sans lui, le
 * test est ignoré plutôt que faussement rouge.
 */
const secret = process.env.CRON_SECRET;
const MARKER = "E2E-Rappel";

/** Jour et heure à Paris, `hoursAhead` heures après maintenant. */
function parisSlot(hoursAhead: number) {
  const at = new Date(Date.now() + hoursAhead * 60 * 60 * 1000);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(at).map((part) => [part.type, part.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, start: `${parts.hour}:${parts.minute}` };
}

async function cleanup() {
  await sql`DELETE FROM "Appointment" WHERE "clientName" LIKE ${`${MARKER}%`}`;
  await sql`DELETE FROM "Client" WHERE "lastName" LIKE ${`${MARKER}%`}`;
}

async function runJobs() {
  const response = await fetch("http://localhost:3000/api/cron/daily", { headers: { Authorization: `Bearer ${secret}` } });
  expect(response.status, "la tâche doit accepter le secret du serveur").toBe(200);
  return response.json() as Promise<{ appointmentReminders: { enabled: boolean; sent: number; failed: number } | null }>;
}

test.describe.configure({ mode: "serial" });

test("le rendez-vous confirmé qui approche reçoit son rappel, une seule fois, et lui seul", async () => {
  test.skip(!secret, "CRON_SECRET absent : lancer le serveur de test avec le même secret");
  await cleanup();

  const [profile] = await sql`SELECT id, "reminderSettings" FROM "BusinessProfile" LIMIT 1`;
  const settings = { ...(profile.reminderSettings ?? {}), appointmentReminderEnabled: true, appointmentReminderDelay: "24 heures avant" };
  await sql`UPDATE "BusinessProfile" SET "reminderSettings" = ${JSON.stringify(settings)}::jsonb WHERE id = ${profile.id}`;

  const [client] = await sql`
    INSERT INTO "Client" (id, "firstName", "lastName", phone, email, city, address, "updatedAt")
    VALUES (${`e2e-rappel-${Date.now()}`}, 'Audit', ${`${MARKER}Client`}, '0600000000', 'rappel-e2e@example.fr', 'Rouen', '1 rue Test', now())
    RETURNING id`;

  const insert = async (label: string, hoursAhead: number, status: "CONFIRMED" | "PENDING") => {
    const slot = parisSlot(hoursAhead);
    const [row] = await sql`
      INSERT INTO "Appointment" (id, "clientId", "clientName", "animalName", "serviceName", date, start, duration, mode, location, price, status, notes, "createdAt", "updatedAt")
      VALUES (${`e2e-rappel-${label}-${Date.now()}`}, ${client.id}, ${`${MARKER} ${label}`}, 'Rex', 'Ostéopathie', ${slot.date}::date, ${slot.start}, 45, 'CABINET', 'Cabinet', 60, ${status}, '', now(), now())
      RETURNING id`;
    return row.id as string;
  };

  try {
    const due = await insert("proche", 3, "CONFIRMED");
    const tooFar = await insert("lointain", 30, "CONFIRMED");
    const pending = await insert("attente", 5, "PENDING");

    const first = await runJobs();
    console.log("premier passage :", JSON.stringify(first.appointmentReminders));

    const rows = await sql`SELECT id, "reminderSentAt" FROM "Appointment" WHERE id IN (${due}, ${tooFar}, ${pending})`;
    const sentAt = Object.fromEntries(rows.map((row) => [row.id, row.reminderSentAt]));
    expect(sentAt[due], "le rendez-vous confirmé dans 3 h a reçu son rappel").not.toBeNull();
    expect(sentAt[tooFar], "celui dans 30 h, hors de la fenêtre de 24 h, non").toBeNull();
    expect(sentAt[pending], "une demande pas encore confirmée, non").toBeNull();

    const second = await runJobs();
    console.log("second passage :", JSON.stringify(second.appointmentReminders));
    expect(second.appointmentReminders?.sent, "un second passage ne renvoie rien").toBe(0);
  } finally {
    await cleanup();
    await sql`UPDATE "BusinessProfile" SET "reminderSettings" = ${profile.reminderSettings === null ? null : JSON.stringify(profile.reminderSettings)}::jsonb WHERE id = ${profile.id}`;
  }
});

test("rappel désactivé dans les paramètres : rien ne part", async () => {
  test.skip(!secret, "CRON_SECRET absent");
  const [profile] = await sql`SELECT id, "reminderSettings" FROM "BusinessProfile" LIMIT 1`;
  const settings = { ...(profile.reminderSettings ?? {}), appointmentReminderEnabled: false };
  await sql`UPDATE "BusinessProfile" SET "reminderSettings" = ${JSON.stringify(settings)}::jsonb WHERE id = ${profile.id}`;
  try {
    const result = await runJobs();
    expect(result.appointmentReminders?.enabled).toBe(false);
    expect(result.appointmentReminders?.sent).toBe(0);
  } finally {
    await sql`UPDATE "BusinessProfile" SET "reminderSettings" = ${profile.reminderSettings === null ? null : JSON.stringify(profile.reminderSettings)}::jsonb WHERE id = ${profile.id}`;
  }
});
