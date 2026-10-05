import { expect, test, type Page } from "@playwright/test";
import { neon, type SqlTag } from "./helpers/sql";
import { pseudonymize } from "../src/lib/privacy";
import { JOIN_TABLES } from "../src/lib/deletion-plan";
import { config } from "dotenv";

config({ path: ".env.local" });

/**
 * Preuve que l'effacement d'un espace ne laisse rien (chantier C9, phase 4).
 *
 * Deux espaces, A et B, remplis dans chaque table — A avec un marqueur unique
 * dans chaque ligne. On efface A par le vrai chemin (tâche planifiée à
 * l'échéance), puis on fouille TOUTE la base en SQL brut, ligne entière
 * convertie en texte : ni le marqueur, ni l'identifiant de A, ni ceux de ses
 * comptes, ni leurs adresses (en clair ou en empreinte) ne doivent rester.
 * B, lui, doit être intact.
 *
 * Base de test uniquement (voir organization-deletion.spec.ts pour le lancement).
 */
const DATABASE_URL = process.env.DATABASE_URL ?? "";
const onTestDatabase = (() => {
  try {
    return new URL(DATABASE_URL).pathname.endsWith("_test");
  } catch {
    return false;
  }
})();
test.skip(!onTestDatabase, "Effacement réservé à la base de test locale.");

const sql = neon(DATABASE_URL);
const CRON_SECRET = process.env.CRON_SECRET ?? "e2e-cron-local";
const PASSWORD = "Canari-E2E-2026!";
const run = Math.random().toString(16).slice(2, 8);
const A = `CANARI-7f3a-${run}`;
const B = `TEMOIN-b9c2-${run}`;

type Seeded = { org: string; users: string[]; emails: string[]; clientEmail: string };

/** Un espace dont chaque table contient au moins une ligne portant `marker`. */
async function seed(db: SqlTag, marker: string): Promise<Seeded> {
  const id = (name: string) => `${marker}-${name}`;
  const org = id("org");
  const users = [id("u1"), id("u2")];
  const emails = users.map((user) => `${user.toLowerCase()}@example.fr`);
  const clientEmail = `${id("client").toLowerCase()}@example.fr`;
  const bcrypt = (await import("bcryptjs")).default;
  const hash = await bcrypt.hash(PASSWORD, 4);
  const day = new Date(Date.now() + 5 * 24 * 3600_000).toISOString().slice(0, 10);

  await db`INSERT INTO "Organization" (id, name, "onboardedAt", "updatedAt") VALUES (${org}, ${`Cabinet ${marker}`}, now(), now())`;
  for (const [index, user] of users.entries()) {
    await db`INSERT INTO "User" (id, email, "passwordHash", "firstName", "lastName", role, "organizationId", "updatedAt")
      VALUES (${user}, ${emails[index]}, ${hash}, ${marker}, ${`Compte ${marker}`}, ${index === 0 ? "ADMIN" : "PRACTITIONER"}, ${org}, now())`;
  }
  const [u1] = users;
  await db`INSERT INTO "Session" (id, "userId", "expiresAt", "userAgent") VALUES (${id("session")}, ${u1}, now() + interval '1 day', ${marker})`;
  await db`INSERT INTO "PasswordResetToken" (id, "userId", "tokenHash", "expiresAt") VALUES (${id("reset")}, ${u1}, ${id("reset-hash")}, now() + interval '1 hour')`;
  await db`INSERT INTO "TwoFactorCode" (id, "userId", "codeHash", "expiresAt") VALUES (${id("2fa")}, ${u1}, ${id("2fa-hash")}, now() + interval '1 hour')`;
  await db`INSERT INTO "AgendaPreferences" (id, "userId", "updatedAt") VALUES (${id("agenda")}, ${u1}, now())`;
  await db`INSERT INTO "TourPreferences" (id, "userId", "updatedAt") VALUES (${id("tourpref")}, ${u1}, now())`;
  await db`INSERT INTO "DashboardPreferences" (id, "userId", widgets, "updatedAt") VALUES (${id("dash")}, ${u1}, ${JSON.stringify([marker])}::jsonb, now())`;
  await db`INSERT INTO "CalendarConnection" (id, "userId", provider, "providerAccountId", "accountEmail", "calendarId", "calendarName", "accessTokenEncrypted", "refreshTokenEncrypted", "accessTokenExpiresAt", "updatedAt")
    VALUES (${id("cal")}, ${u1}, 'GOOGLE', ${id("google")}, ${emails[0]}, ${id("calendar")}, ${marker}, 'jeton-factice', 'jeton-factice', now() + interval '1 day', now())`;
  await db`INSERT INTO "ClientImport" (id, "organizationId", "userId", "fileName", "totalRows", "conflictPolicy", "updatedAt") VALUES (${id("import")}, ${org}, ${u1}, ${`${marker}.csv`}, 1, 'skip', now())`;
  await db`INSERT INTO "Client" (id, "organizationId", "importId", "firstName", "lastName", phone, email, city, address, "updatedAt")
    VALUES (${id("client")}, ${org}, ${id("import")}, ${marker}, ${`Client ${marker}`}, '0600000000', ${clientEmail}, 'Rouen', ${`1 rue ${marker}`}, now())`;
  await db`INSERT INTO "AnimalPlace" (id, "organizationId", name, address, city, "updatedAt") VALUES (${id("place")}, ${org}, ${`Haras ${marker}`}, ${`2 chemin ${marker}`}, 'Rouen', now())`;
  await db`INSERT INTO "Animal" (id, "organizationId", "clientId", "placeId", name, species, breed, age, weight, sex, avatar, "avatarBackground", history, conditions, treatments, notes, "updatedAt")
    VALUES (${id("animal")}, ${org}, ${id("client")}, ${id("place")}, ${`Filou ${marker}`}, 'Chien', '', '', '', '', '', '', ${marker}, '', '', '', now())`;
  await db`INSERT INTO "Consultation" (id, "organizationId", "animalId", date, service, mode, price, summary) VALUES (${id("consult")}, ${org}, ${id("animal")}, now(), 'Séance', 'CABINET', 60, ${marker})`;
  await db`INSERT INTO "AnimalDocument" (id, "organizationId", "animalId", name, type, "linkedTo") VALUES (${id("animaldoc")}, ${org}, ${id("animal")}, ${marker}, 'PDF', '')`;
  await db`INSERT INTO "StudioDocumentTemplate" (id, "organizationId", name, "contentJson", "updatedAt") VALUES (${id("template")}, ${org}, ${marker}, '{}'::jsonb, now())`;
  await db`INSERT INTO "Appointment" (id, "organizationId", "clientId", "animalId", "clientName", "animalName", "serviceName", date, start, duration, mode, location, price, status, notes, "updatedAt")
    VALUES (${id("rdv")}, ${org}, ${id("client")}, ${id("animal")}, ${`Client ${marker}`}, ${`Filou ${marker}`}, 'Séance', ${day}::date, '10:00', 45, 'DOMICILE', ${`1 rue ${marker}`}, 60, 'CONFIRMED', ${marker}, now())`;
  await db`INSERT INTO "StudioDocument" (id, "organizationId", title, "clientId", "animalId", "appointmentId", "templateId", "createdByUserId", "contentJson", "updatedAt")
    VALUES (${id("doc")}, ${org}, ${marker}, ${id("client")}, ${id("animal")}, ${id("rdv")}, ${id("template")}, ${u1}, '{}'::jsonb, now())`;
  await db`INSERT INTO "AppointmentCalendarEvent" (id, "organizationId", "appointmentId", "connectionId", "externalEventId", "updatedAt") VALUES (${id("event")}, ${org}, ${id("rdv")}, ${id("cal")}, ${id("google-event")}, now())`;
  await db`INSERT INTO "BlockedSlot" (id, "organizationId", "userId", date, "startTime", "endTime", reason) VALUES (${id("blocked")}, ${org}, ${u1}, ${day}::date, '08:00', '09:00', ${marker})`;
  await db`INSERT INTO "Reminder" (id, "organizationId", "clientId", "animalId", "lastConsultation", delay, "dueDate", note, "updatedAt") VALUES (${id("reminder")}, ${org}, ${id("client")}, ${id("animal")}, now(), 'SIX_MONTHS', now(), ${marker}, now())`;
  await db`INSERT INTO "Zone" (id, "organizationId", name) VALUES (${id("zone")}, ${org}, ${`Zone ${marker}`})`;
  await db`INSERT INTO "City" (id, "organizationId", "zoneId", name, "postalCode") VALUES (${id("city")}, ${org}, ${id("zone")}, ${marker}, '76000')`;
  await db`INSERT INTO "Tour" (id, "organizationId", "zoneId", name, recurrence, day, "dateLabel", "startTime", "endTime") VALUES (${id("tour")}, ${org}, ${id("zone")}, ${marker}, 'Toutes les semaines', 'Jeudi', 'Chaque jeudi', '09:00', '18:00')`;
  await db`INSERT INTO "_TourZones" ("A", "B") VALUES (${id("tour")}, ${id("zone")})`;
  await db`INSERT INTO "BusinessProfile" (id, "organizationId", slug, "firstName", "lastName", profession, company, phone, email, address, "postalCode", city, location, bio, photo, logo, "publicColor", "updatedAt")
    VALUES (${id("profil")}, ${org}, ${marker.toLowerCase()}, ${marker}, ${marker}, 'Ostéopathe', ${`Cabinet ${marker}`}, '', ${emails[0]}, ${`3 place ${marker}`}, '76000', 'Rouen', '', ${marker}, '', '', '#a0522d', now())`;
  await db`INSERT INTO "Service" (id, "organizationId", name, description, duration, "cabinetPrice", "homePrice", "suggestedReminder") VALUES (${id("service")}, ${org}, ${marker}, ${marker}, 45, 60, 70, '6 mois')`;
  await db`INSERT INTO "SavedPlace" (id, "organizationId", "userId", label, type, address, latitude, longitude, "updatedAt") VALUES (${id("saved")}, ${org}, ${u1}, ${marker}, 'HOME', ${`4 allée ${marker}`}, 49.4, 1.1, now())`;
  await db`INSERT INTO "TourRun" (id, "organizationId", "userId", "templateId", "startSavedPlaceId", name, date, "startType", "endType", "updatedAt")
    VALUES (${id("run")}, ${org}, ${u1}, ${id("tour")}, ${id("saved")}, ${marker}, ${day}::date, 'CABINET', 'SAME_AS_START', now())`;
  await db`INSERT INTO "TourStop" (id, "organizationId", "tourRunId", "appointmentId", "order", type, label, "updatedAt") VALUES (${id("stop")}, ${org}, ${id("run")}, ${id("rdv")}, 1, 'APPOINTMENT', ${marker}, now())`;
  await db`INSERT INTO "MapView" (id, "organizationId", "userId", name, query, "updatedAt") VALUES (${id("view")}, ${org}, ${u1}, ${marker}, ${`q=${marker}`}, now())`;
  await db`INSERT INTO "Invitation" (id, "organizationId", email, "organizationName", "tokenHash", "expiresAt", "usedAt") VALUES (${id("invite-used")}, ${org}, ${emails[0]}, ${`Cabinet ${marker}`}, ${id("token-1")}, now(), now())`;
  await db`INSERT INTO "Invitation" (id, email, "organizationName", "tokenHash", "expiresAt") VALUES (${id("invite-again")}, ${emails[1]}, ${marker}, ${id("token-2")}, now() + interval '7 days')`;
  await db`INSERT INTO "AuditLog" (id, "organizationId", "userId", action, "entityType", "entityId", metadata) VALUES (${id("audit-espace")}, ${org}, ${u1}, 'CLIENT_CREATED', 'Client', ${id("client")}, ${JSON.stringify({ note: marker })}::jsonb)`;
  await db`INSERT INTO "AuditLog" (id, action, "entityType", "entityId") VALUES (${id("audit-plateforme")}, 'ORGANIZATION_SUSPENDED', 'Organization', ${org})`;
  // Ancienne forme, antérieure aux empreintes : l'adresse en clair, sans compte ni espace.
  await db`INSERT INTO "AuditLog" (id, action, metadata) VALUES (${id("audit-ancien")}, 'LOGIN_FAILED', ${JSON.stringify({ email: emails[1] })}::jsonb)`;
  await db`INSERT INTO "RateLimitEvent" (id, key) VALUES (${id("rate-ancien")}, ${`login:${emails[1]}`})`;
  await db`INSERT INTO "RateLimitEvent" (id, key) VALUES (${id("rate-import")}, ${`client-import:${u1}`})`;
  return { org, users, emails, clientEmail };
}

/** Lignes de chaque table qui contiennent l'un des motifs (ligne entière en texte). */
async function occurrences(patterns: string[]): Promise<Record<string, number>> {
  const tables = (await sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name <> '_prisma_migrations' ORDER BY table_name`).map((row) => row.table_name as string);
  const likes = patterns.map((pattern) => `%${pattern.toLowerCase()}%`);
  const result: Record<string, number> = {};
  for (const table of tables) {
    const query = Object.assign([`SELECT count(*)::int AS n FROM "${table}" t WHERE lower(t::text) LIKE ANY(`, ")"], { raw: [] }) as unknown as TemplateStringsArray;
    const [row] = await sql(query, likes);
    result[table] = row.n as number;
  }
  return result;
}

async function realTraces(page: Page, email: string) {
  // Connexion échouée et mot de passe oublié, par les vrais formulaires :
  // clés de limitation en empreinte, journal, jeton de réinitialisation.
  await page.goto("/login", { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', "mauvais-mot-de-passe");
  await page.click('button[type="submit"]');
  await expect(page.getByText("Email ou mot de passe incorrect.")).toBeVisible();
  await page.goto("/mot-de-passe-oublie", { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', email);
  await page.click('button[type="submit"]');
  await expect.poll(async () => (await sql`SELECT count(*)::int AS n FROM "PasswordResetToken" t JOIN "User" u ON u.id = t."userId" WHERE u.email = ${email}`)[0].n).toBeGreaterThan(1);
}

async function purgeByScheduler(page: Page, org: string) {
  await sql`UPDATE "Organization" SET "suspendedAt" = now(), "deletionScheduledFor" = now() - interval '1 minute' WHERE id = ${org}`;
  const response = await page.request.get(`/api/cron/daily?organization=${org}`, { headers: { Authorization: `Bearer ${CRON_SECRET}` } });
  expect(response.status()).toBe(200);
  return response.json() as Promise<{ organizationsPurged: number }>;
}

test("effacer A ne laisse aucune trace de A, nulle part, et ne touche pas à B", async ({ page }) => {
  test.setTimeout(180_000);
  const b = await seed(sql, B);
  const a = await seed(sql, A);
  await realTraces(page, a.emails[0]);

  // Toutes les tables de la base sont des modèles connus ou des liaisons déclarées.
  const tables = Object.keys(await occurrences(["__aucun__"]));
  const { Prisma } = await import("../src/generated/prisma/browser");
  // _TestDatabase : la marque de la base de test (scripts/test-db.mjs), absente en production.
  const testInfrastructure = ["_TestDatabase"];
  const unknown = tables.filter((table) => !(table in Prisma.ModelName) && !(JOIN_TABLES as readonly string[]).includes(table) && !testInfrastructure.includes(table));
  expect(unknown, "table inconnue de la purge (liaison implicite ?) : à déclarer dans deletion-plan.ts").toEqual([]);

  const aPatterns = [A, a.org, ...a.users, ...a.emails, a.clientEmail, ...[...a.emails, a.clientEmail].map((email) => pseudonymize(email))];
  const before = await occurrences(aPatterns);
  const filled = Object.entries(before).filter(([, count]) => count > 0).map(([table]) => table);
  const expectedEmpty = ["DeletionRecord", ...testInfrastructure];
  expect(tables.filter((table) => !filled.includes(table) && !expectedEmpty.includes(table)), "chaque table contient une trace de A avant l'effacement").toEqual([]);
  const bBefore = await occurrences([B]);

  expect((await purgeByScheduler(page, a.org)).organizationsPurged).toBe(1);

  const after = await occurrences(aPatterns);
  expect(Object.fromEntries(Object.entries(after).filter(([, count]) => count > 0)), "aucune occurrence de A, dans aucune table").toEqual({});
  expect(await occurrences([B]), "B est intact").toEqual(bBefore);

  // La preuve existe, sans donnée personnelle (déjà vérifié par la fouille ci-dessus).
  const [record] = await sql`SELECT "purgedAt", "rowCounts" FROM "DeletionRecord" WHERE "organizationHash" = encode(sha256(convert_to(${`organization:${a.org}`}, 'UTF8')), 'hex')`;
  expect(record.purgedAt).not.toBeNull();
  expect(record.rowCounts).toMatchObject({ _TourZones: 1, CalendarConnection: 1, Invitation: 2 });

  // B, effacé à son tour : la base de test revient à l'état d'avant.
  expect((await purgeByScheduler(page, b.org)).organizationsPurged).toBe(1);
  expect(Object.fromEntries(Object.entries(await occurrences([B])).filter(([, count]) => count > 0))).toEqual({});
  await sql`DELETE FROM "DeletionRecord" WHERE "organizationHash" IN (encode(sha256(convert_to(${`organization:${a.org}`}, 'UTF8')), 'hex'), encode(sha256(convert_to(${`organization:${b.org}`}, 'UTF8')), 'hex'))`;
});
