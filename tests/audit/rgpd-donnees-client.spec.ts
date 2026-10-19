import { readFileSync } from "node:fs";
import { expect, test } from "../helpers/test";
import { neon } from "../helpers/sql";
import { config } from "dotenv";
import { BASE_URL } from "../helpers/base-url";

config({ path: ".env.local" });
const sql = neon(process.env.DATABASE_URL!);
const BASE = BASE_URL;

/**
 * Phase 4 — Protection des données. Preuves pour `RGPD-03` (supprimer un
 * client ne l'efface pas) et `RGPD-08` (annuaire complet des clients envoyé
 * à chaque page, ex-`PERF-01`) — docs/audit-2026-10/04-RGPD-CONFORMITE.md.
 *
 * Même règle que les specs de la phase 3 : un test rouge prouve le défaut.
 * Les constats sont faits en `expect.soft` : chaque reste est relevé, même
 * quand un précédent a déjà échoué.
 *
 * Tout ce qui est créé ici porte le marqueur AUDIT4 et est supprimé à la fin ;
 * les réglages modifiés le temps d'un essai (permission du compte de test,
 * jeton du flux d'agenda) reprennent leur valeur d'origine.
 */

const MARKER = "AUDIT4";
const ORG = "org-1002-pattes";
const PRACTITIONER_EMAIL = "praticien-test@pf-osteo-animale.fr";
const id = (suffix: string) => `audit-phase4-${suffix}`;

// Données fictives. Numéro dans une tranche réservée aux œuvres de fiction.
const ERASED = {
  lastName: `${MARKER}Efface`,
  address: `7 rue ${MARKER} Effacement`,
  latitude: 49.4431,
  longitude: 1.0993,
};
const DIRECTORY = {
  lastName: `${MARKER}Annuaire`,
  phone: "01 99 00 44 44",
  email: "audit-phase4-annuaire@example.fr",
  address: `9 impasse ${MARKER} Annuaire`,
};

function practitionerCookie(): string {
  const state = JSON.parse(readFileSync("tests/.auth/practitioner.json", "utf8")) as { cookies: { name: string; value: string }[] };
  return state.cookies.map((c) => `${c.name}=${c.value}`).join("; ");
}

async function actionIdsWithCookie(path: string, cookie: string): Promise<Record<string, string>> {
  const html = await (await fetch(`${BASE}${path}`, { headers: { Cookie: cookie } })).text();
  const chunks = [...new Set(html.match(/\/_next\/static\/[^"'\s]+\.js/g) ?? [])];
  const ids: Record<string, string> = {};
  for (const chunk of chunks) {
    const js = await (await fetch(`${BASE}${chunk}`)).text();
    for (const m of js.matchAll(/"([0-9a-f]{40,})":\{"name":"(\w+)"\}/g)) ids[m[2]] = m[1];
  }
  return ids;
}

async function callAction(actionId: string, args: unknown[], path: string, cookie: string) {
  const response = await fetch(`${BASE}${path}`, {
    method: "POST",
    redirect: "manual",
    headers: { "Next-Action": actionId, "Content-Type": "text/plain;charset=UTF-8", Accept: "text/x-component", Origin: BASE, Cookie: cookie },
    body: JSON.stringify(args),
  });
  const raw = await response.text();
  let value: unknown;
  for (const line of raw.split("\n")) {
    const m = /^1:(\{.*\}|\[.*\])$/.exec(line);
    if (m) { try { value = JSON.parse(m[1]); } catch { /* flux partiel : la base tranche */ } }
  }
  return { status: response.status, raw, value };
}

let practitionerId = "";
let originalPermissions: string[] = [];
let originalIcsToken: string | null = null;

async function cleanup() {
  await sql`DELETE FROM "TourStop" WHERE label LIKE ${`%${MARKER}%`}`;
  await sql`DELETE FROM "TourRun" WHERE name LIKE ${`%${MARKER}%`}`;
  await sql`DELETE FROM "StudioDocument" WHERE title LIKE ${`%${MARKER}%`}`;
  await sql`DELETE FROM "Appointment" WHERE "clientName" LIKE ${`%${MARKER}%`}`;
  await sql`DELETE FROM "Animal" WHERE id LIKE ${"audit-phase4-%"}`;
  await sql`DELETE FROM "Client" WHERE id LIKE ${"audit-phase4-%"}`;
  await sql`DELETE FROM "AuditLog" WHERE "entityId" LIKE ${"audit-phase4-%"}`;
}

// Pas de mode « serial » : les deux essais sont indépendants, et le premier,
// rouge par construction tant que le défaut existe, ne doit pas empêcher le
// second de s'exécuter.

test.beforeAll(async () => {
  await cleanup();
  const [user] = await sql`SELECT id, permissions, "icsFeedToken" FROM "User" WHERE email = ${PRACTITIONER_EMAIL}`;
  practitionerId = user.id;
  originalPermissions = user.permissions;
  originalIcsToken = user.icsFeedToken;
});

test.afterAll(async () => {
  await cleanup();
  await sql`UPDATE "User" SET permissions = ${originalPermissions}, "icsFeedToken" = ${originalIcsToken} WHERE id = ${practitionerId}`;
});

// ---------------------------------------------------------------------------
// RGPD-03 : supprimer un client depuis l'écran ne l'efface pas de la base.
// ---------------------------------------------------------------------------

test("RGPD-03 — après « Supprimer définitivement », il ne reste rien qui nomme ou situe le client", async () => {
  const fullName = `Camille ${ERASED.lastName}`;
  const date = new Date(Date.now() + 230 * 24 * 60 * 60 * 1000); // loin dans le futur : aucune chance de heurter un autre test
  date.setUTCHours(0, 0, 0, 0);

  await sql`
    INSERT INTO "Client" (id, "organizationId", "firstName", "lastName", phone, email, city, address, latitude, longitude, "updatedAt")
    VALUES (${id("client")}, ${ORG}, 'Camille', ${ERASED.lastName}, '01 99 00 33 33', 'audit-phase4-efface@example.fr', 'Rouen', ${ERASED.address}, ${ERASED.latitude}, ${ERASED.longitude}, now())`;
  await sql`
    INSERT INTO "Animal" (id, "organizationId", "clientId", name, species, breed, age, weight, sex, avatar, "avatarBackground", history, conditions, treatments, notes, "updatedAt")
    VALUES (${id("animal")}, ${ORG}, ${id("client")}, ${`${MARKER}Filou`}, 'Chien', '', '', '', '', '', '', '', '', '', '', now())`;
  await sql`
    INSERT INTO "Appointment" (id, "organizationId", "clientId", "animalId", "clientName", "animalName", "serviceName", date, start, duration, mode, location, latitude, longitude, price, status, notes, "updatedAt")
    VALUES (${id("appointment")}, ${ORG}, ${id("client")}, ${id("animal")}, ${fullName}, ${`${MARKER}Filou`}, 'Ostéopathie', ${date}, '06:10', 30, 'DOMICILE', ${ERASED.address}, ${ERASED.latitude}, ${ERASED.longitude}, 0, 'CONFIRMED', ${`Portail vert — ${MARKER}`}, now())`;
  await sql`
    INSERT INTO "TourRun" (id, "organizationId", "userId", name, date, "startType", "endType", "updatedAt")
    VALUES (${id("tourrun")}, ${ORG}, ${practitionerId}, ${`Tournée ${MARKER}`}, ${date}, 'CABINET', 'CABINET', now())`;
  // Libellé et adresse recopiés comme le fait addAppointmentStopsAction (src/lib/tour-runs-actions.ts:619-620).
  await sql`
    INSERT INTO "TourStop" (id, "organizationId", "tourRunId", "appointmentId", "order", type, label, address, latitude, longitude, "updatedAt")
    VALUES (${id("stop")}, ${ORG}, ${id("tourrun")}, ${id("appointment")}, 1, 'APPOINTMENT', ${`${MARKER}Filou — ${fullName}`}, ${ERASED.address}, ${ERASED.latitude}, ${ERASED.longitude}, now())`;
  await sql`
    INSERT INTO "StudioDocument" (id, "organizationId", title, "clientId", "animalId", "appointmentId", "createdByUserId", "contentJson", "updatedAt")
    VALUES (${id("document")}, ${ORG}, ${`Compte rendu ${MARKER} — ${fullName}`}, ${id("client")}, ${id("animal")}, ${id("appointment")}, ${practitionerId}, ${JSON.stringify({ pages: [{ text: fullName }] })}, now())`;

  // Le compte de test n'a aucune permission par défaut : DELETE_CLIENTS le
  // temps de l'essai, comme tests/clients-bulk-delete.spec.ts.
  await sql`UPDATE "User" SET permissions = ARRAY['DELETE_CLIENTS'] WHERE id = ${practitionerId}`;

  const cookie = practitionerCookie();
  // L'action n'est publiée que par la fiche du client (client-profile.tsx).
  const ids = await actionIdsWithCookie(`/dashboard/clients/${id("client")}`, cookie);
  expect(ids.deleteClientAction, "action deleteClientAction trouvée : sans elle, ce test ne prouverait rien").toBeTruthy();
  const result = await callAction(ids.deleteClientAction, [id("client")], "/dashboard/clients", cookie);
  expect((result.value as { ok?: boolean } | undefined)?.ok, `suppression acceptée (réponse : ${result.raw.slice(0, 300)})`).toBe(true);

  // Témoin : la fiche, l'animal et ce qui part en cascade ont bien disparu.
  expect(await sql`SELECT 1 FROM "Client" WHERE id = ${id("client")}`, "témoin : la fiche client est supprimée").toHaveLength(0);
  expect(await sql`SELECT 1 FROM "Animal" WHERE id = ${id("animal")}`, "témoin : l'animal est supprimé").toHaveLength(0);

  // Ce qui reste, et nomme ou situe encore la personne.
  const appointments = await sql`SELECT "clientName", location, latitude, longitude, notes FROM "Appointment" WHERE id = ${id("appointment")}`;
  expect.soft(appointments, `rendez-vous restant après suppression : ${JSON.stringify(appointments)}`).toHaveLength(0);

  const stops = await sql`SELECT label, address, latitude, longitude FROM "TourStop" WHERE id = ${id("stop")}`;
  expect.soft(stops, `arrêt de tournée restant après suppression : ${JSON.stringify(stops)}`).toHaveLength(0);

  const documents = await sql`SELECT title FROM "StudioDocument" WHERE id = ${id("document")}`;
  expect.soft(documents, `compte rendu restant après suppression : ${JSON.stringify(documents)}`).toHaveLength(0);

  // Le flux d'agenda (jeton posé le temps de l'essai) continue de publier le nom.
  const token = `audit-phase4-${Date.now()}-flux`;
  await sql`UPDATE "User" SET "icsFeedToken" = ${token} WHERE id = ${practitionerId}`;
  const feed = await fetch(`${BASE}/api/calendar/feed/${token}.ics`);
  expect(feed.status, "flux d'agenda ouvert (module CALENDAR_SYNC)").toBe(200);
  expect.soft(await feed.text(), "le flux d'agenda ne cite plus le client supprimé").not.toContain(ERASED.lastName);
});

// ---------------------------------------------------------------------------
// RGPD-08 (ex-PERF-01) : l'annuaire des clients part avec chaque page.
// ---------------------------------------------------------------------------

test("RGPD-08 — une page sans rapport avec les clients n'envoie pas leurs coordonnées au navigateur", async () => {
  await sql`
    INSERT INTO "Client" (id, "organizationId", "firstName", "lastName", phone, email, city, address, "updatedAt")
    VALUES (${id("annuaire")}, ${ORG}, 'Dominique', ${DIRECTORY.lastName}, ${DIRECTORY.phone}, ${DIRECTORY.email}, 'Rouen', ${DIRECTORY.address}, now())`;

  // « Prestations » : la page des tarifs, qui n'affiche aucun client.
  const response = await fetch(`${BASE}/dashboard/prestations`, { headers: { Cookie: practitionerCookie() } });
  expect(response.status, "page « Prestations » servie au compte connecté").toBe(200);
  const html = await response.text();
  expect(html, "témoin : la page reçue est bien celle des prestations").toContain("Prestations");

  expect.soft(html, "téléphone d'un client absent de la page « Prestations »").not.toContain(DIRECTORY.phone);
  expect.soft(html, "e-mail d'un client absent de la page « Prestations »").not.toContain(DIRECTORY.email);
  expect.soft(html, "adresse d'un client absente de la page « Prestations »").not.toContain(DIRECTORY.address);
});
