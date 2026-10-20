import { readFileSync } from "node:fs";
import { expect, test } from "../helpers/test";
import { neon } from "../helpers/sql";
import { config } from "dotenv";
import { BASE_URL } from "../helpers/base-url";

config({ path: ".env.local" });
const sql = neon(process.env.DATABASE_URL!);
const BASE = BASE_URL;
const secret = process.env.CRON_SECRET;

/**
 * Chantier 11 des correctifs de l'audit 2026-10 — durées de conservation
 * (RGPD-06, src/lib/scheduler/retention.ts).
 *
 * La tâche de fond est déclenchée par sa route protégée, comme
 * appointment-reminders.spec.ts. Tout ce qui est créé porte l'identifiant
 * « audit-conservation-… » et est supprimé à la fin.
 */

const ORG = "org-1002-pattes";
const id = (suffix: string) => `audit-conservation-${suffix}`;
const DAY = 24 * 60 * 60 * 1000;
const ago = (days: number) => new Date(Date.now() - days * DAY);

async function cleanup() {
  await sql`DELETE FROM "Appointment" WHERE id LIKE ${"audit-conservation-%"}`;
  await sql`DELETE FROM "Client" WHERE id LIKE ${"audit-conservation-%"}`;
  await sql`DELETE FROM "AuditLog" WHERE id LIKE ${"audit-conservation-%"} OR "entityId" LIKE ${"audit-conservation-%"}`;
  await sql`DELETE FROM "Session" WHERE id LIKE ${"audit-conservation-%"}`;
}

async function insertClient(suffix: string, createdDaysAgo: number) {
  await sql`
    INSERT INTO "Client" (id, "organizationId", "firstName", "lastName", phone, email, city, address, "createdAt", "updatedAt")
    VALUES (${id(suffix)}, ${ORG}, 'Conservation', ${suffix}, '01 99 00 55 55', ${`${id(suffix)}@example.fr`}, 'Rouen', '1 rue Fictive', ${ago(createdDaysAgo)}, now())`;
}

async function insertCancelledRequest(suffix: string, daysAgo: number, fromPublicBooking: boolean) {
  await sql`
    INSERT INTO "Appointment" (id, "organizationId", "clientId", "clientName", "animalName", "serviceName", date, start, duration, mode, location, price, status, notes, "createdAt", "updatedAt")
    VALUES (${id(`rdv-${suffix}`)}, ${ORG}, ${id(suffix)}, ${`Conservation ${suffix}`}, 'Rex', 'Ostéopathie', ${ago(daysAgo)}, '09:00', 45, 'CABINET', 'Cabinet', 0, 'CANCELLED', '', ${ago(daysAgo)}, ${ago(daysAgo)})`;
  if (fromPublicBooking) {
    await sql`
      INSERT INTO "AuditLog" (id, action, "entityType", "entityId", metadata, "organizationId", "createdAt")
      VALUES (${id(`log-${suffix}`)}, 'APPOINTMENT_CREATED', 'Appointment', ${id(`rdv-${suffix}`)}, ${JSON.stringify({ source: "public_booking" })}::jsonb, ${ORG}, ${ago(daysAgo)})`;
  }
}

test.describe.configure({ mode: "serial" });
test.beforeAll(cleanup);
test.afterAll(cleanup);

test("les purges suivent les durées fixées, et ne touchent qu'à ce qu'elles visent", async () => {
  test.skip(!secret, "CRON_SECRET absent : lancer le serveur de test avec le même secret");

  // Demande en ligne refusée il y a 200 jours : la fiche doit partir.
  await insertClient("demande", 200);
  await insertCancelledRequest("demande", 200, true);
  // Témoin : même situation, mais fiche saisie par le professionnel (aucune trace de la page publique).
  await insertClient("saisie", 200);
  await insertCancelledRequest("saisie", 200, false);
  // Témoin : demande en ligne refusée il y a 30 jours seulement.
  await insertClient("recente", 30);
  await insertCancelledRequest("recente", 30, true);

  // Journal : une ligne de plus d'un an, une récente.
  await sql`INSERT INTO "AuditLog" (id, action, "organizationId", "createdAt") VALUES (${id("log-ancien")}, 'LOGIN_SUCCEEDED', ${ORG}, ${ago(400)}), (${id("log-recent")}, 'LOGIN_SUCCEEDED', ${ORG}, ${ago(10)})`;
  // Sessions : une révoquée il y a 60 jours, une encore valable.
  const [user] = await sql`SELECT id FROM "User" WHERE email = 'praticien-test@pf-osteo-animale.fr'`;
  await sql`INSERT INTO "Session" (id, "userId", "createdAt", "expiresAt", "revokedAt") VALUES (${id("session-ancienne")}, ${user.id}, ${ago(70)}, ${ago(63)}, ${ago(60)}), (${id("session-valable")}, ${user.id}, now(), ${new Date(Date.now() + 7 * DAY)}, NULL)`;

  const response = await fetch(`${BASE}/api/cron/daily?organization=${ORG}`, { headers: { Authorization: `Bearer ${secret}` } });
  expect(response.status, "la tâche accepte le secret du serveur").toBe(200);

  expect(await sql`SELECT 1 FROM "Client" WHERE id = ${id("demande")}`, "fiche de la demande jamais acceptée, effacée").toHaveLength(0);
  const [request] = await sql`SELECT "clientName", "clientId" FROM "Appointment" WHERE id = ${id("rdv-demande")}`;
  expect(request, "sa demande reste, anonymisée, comme pour toute suppression").toEqual({ clientName: "Client supprimé", clientId: null });
  expect(await sql`SELECT 1 FROM "Client" WHERE id = ${id("saisie")}`, "fiche saisie par le professionnel : gardée").toHaveLength(1);
  expect(await sql`SELECT 1 FROM "Client" WHERE id = ${id("recente")}`, "demande de moins de six mois : gardée").toHaveLength(1);

  expect(await sql`SELECT 1 FROM "AuditLog" WHERE id = ${id("log-ancien")}`, "journal de plus d'un an : purgé").toHaveLength(0);
  expect(await sql`SELECT 1 FROM "AuditLog" WHERE id = ${id("log-recent")}`, "journal récent : gardé").toHaveLength(1);
  expect(await sql`SELECT 1 FROM "Session" WHERE id = ${id("session-ancienne")}`, "session révoquée depuis 60 jours : purgée").toHaveLength(0);
  expect(await sql`SELECT 1 FROM "Session" WHERE id = ${id("session-valable")}`, "session valable : gardée").toHaveLength(1);
});

test("un client sans rendez-vous depuis trois ans est signalé, pas supprimé", async () => {
  await insertClient("inactif", 4 * 365);
  const state = JSON.parse(readFileSync("tests/.auth/practitioner.json", "utf8")) as { cookies: { name: string; value: string }[] };
  const cookie = state.cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  const html = await (await fetch(`${BASE}/dashboard/clients`, { headers: { Cookie: cookie } })).text();
  expect(html, "le filtre « Sans rendez-vous depuis 3 ans » est proposé").toContain("Sans rendez-vous depuis 3 ans");
  expect(await sql`SELECT 1 FROM "Client" WHERE id = ${id("inactif")}`, "la fiche reste").toHaveLength(1);
});
