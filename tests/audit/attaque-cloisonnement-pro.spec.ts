import { readFileSync } from "node:fs";
import { expect, test } from "../helpers/test";
import { neon } from "../helpers/sql";
import { config } from "dotenv";
import { BASE_URL } from "../helpers/base-url";

config({ path: ".env.local" });
const sql = neon(process.env.DATABASE_URL!);
const BASE = BASE_URL;

/**
 * Phase 3 — Profil 3 : un professionnel du cabinet A contre le cabinet B.
 *
 * Preuve pour `SEC-09` (communes d'une zone enregistrées au nom du premier
 * cabinet) et `SEC-10` (identifiants reçus du navigateur enregistrés comme
 * liens sans être revérifiés) — docs/audit-2026-10/02-SECURITE-CODE.md.
 *
 * Tout ce qui est créé ici porte le marqueur AUDIT3 et est supprimé à la fin,
 * y compris en cas d'échec en cours de route.
 */

const MARKER = "AUDIT3";
const OTHER = "org-audit-phase3-b";
const OTHER_EMAIL = "audit-phase3-b@example.fr";
const OTHER_PASSWORD = "Audit-Phase3-2026!";
const id = (suffix: string) => `${OTHER}-${suffix}`;

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

async function callAction(id: string, args: unknown[], path: string, cookie: string) {
  const response = await fetch(`${BASE}${path}`, {
    method: "POST",
    redirect: "manual",
    headers: { "Next-Action": id, "Content-Type": "text/plain;charset=UTF-8", Accept: "text/x-component", Origin: BASE, Cookie: cookie },
    body: JSON.stringify(args),
  });
  const raw = await response.text();
  let value: unknown;
  for (const line of raw.split("\n")) {
    const m = /^1:(\{.*\}|\[.*\])$/.exec(line);
    if (m) { try { value = JSON.parse(m[1]); } catch { /* flux partiel, ou une erreur : la base tranche */ } }
  }
  return { status: response.status, raw, value };
}

async function cleanup() {
  await sql`DELETE FROM "City" WHERE name LIKE ${`${MARKER}%`}`;
  await sql`DELETE FROM "Zone" WHERE name LIKE ${`${MARKER}%`}`;
  await sql`DELETE FROM "Appointment" WHERE "clientName" LIKE ${`%${MARKER}%`}`;
  await sql`DELETE FROM "Animal" WHERE "organizationId" = ${OTHER}`;
  await sql`DELETE FROM "Client" WHERE "organizationId" = ${OTHER}`;
  await sql`DELETE FROM "Session" WHERE "userId" IN (SELECT id FROM "User" WHERE "organizationId" = ${OTHER})`;
  await sql`DELETE FROM "User" WHERE "organizationId" = ${OTHER}`;
  // La première visite du tableau de bord crée un profil vide (voir
  // src/lib/business-profile-actions.ts, getBusinessProfile) : à nettoyer
  // avant de pouvoir supprimer l'espace.
  await sql`DELETE FROM "BusinessProfile" WHERE "organizationId" = ${OTHER}`;
  await sql`DELETE FROM "AuditLog" WHERE "organizationId" = ${OTHER}`;
  await sql`DELETE FROM "Organization" WHERE id = ${OTHER}`;
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await cleanup();
  const bcrypt = (await import("bcryptjs")).default;
  await sql`INSERT INTO "Organization" (id, name, modules, "createdAt", "updatedAt") VALUES (${OTHER}, ${`${MARKER} Cabinet B`}, ARRAY['TOURS'], now(), now())`;
  await sql`
    INSERT INTO "User" (id, email, "passwordHash", "firstName", "lastName", role, permissions, "organizationId", "updatedAt")
    VALUES (${id("user")}, ${OTHER_EMAIL}, ${await bcrypt.hash(OTHER_PASSWORD, 10)}, 'Audit', 'CabinetB', 'PRACTITIONER', ARRAY['MANAGE_PUBLIC_SETTINGS'], ${OTHER}, now())`;
  await sql`
    INSERT INTO "Client" (id, "organizationId", "firstName", "lastName", phone, email, city, address, "updatedAt")
    VALUES (${id("client")}, ${OTHER}, 'Camille', ${`${MARKER}Victime`}, '0600000000', 'audit-phase3-victime@example.fr', 'Dieppe', '2 rue Ailleurs', now())`;
  await sql`
    INSERT INTO "Animal" (id, "organizationId", "clientId", name, species, breed, age, weight, sex, avatar, "avatarBackground", history, conditions, treatments, notes, "updatedAt")
    VALUES (${id("animal")}, ${OTHER}, ${id("client")}, ${`${MARKER}Filou`}, 'Chien', '', '', '', '', '', '', '', '', '', '', now())`;
});

test.afterAll(async () => {
  await cleanup();
});

// ---------------------------------------------------------------------------
// SEC-09 : les communes d'une zone, créée par le cabinet B, au nom du
// cabinet A (valeur par défaut de la colonne).
// ---------------------------------------------------------------------------

test("SEC-09 — une zone créée par le cabinet B avec des communes ne s'enregistre pas chez un autre cabinet", async ({ page }) => {
  await page.goto("/login");
  await page.fill('input[type="email"]', OTHER_EMAIL);
  await page.fill('input[type="password"]', OTHER_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard**", { timeout: 15000 });
  const cookie = (await page.context().cookies()).map((c) => `${c.name}=${c.value}`).join("; ");

  const ids = await actionIdsWithCookie("/dashboard/parametres?tab=tours", cookie);
  expect(ids.saveZoneAction, "action saveZoneAction trouvée").toBeTruthy();

  const cityName = `${MARKER} Ville`;
  const result = await callAction(
    ids.saveZoneAction,
    [{ name: `${MARKER} Zone`, cities: [{ id: "tmp-1", name: cityName, postalCode: "99999" }], sector: null }],
    "/dashboard/parametres?tab=tours",
    cookie,
  );

  // Ce qui compte est la base, pas le message : avec la seconde barrière
  // (RLS) active, l'écriture d'une commune au nom d'un autre cabinet que
  // celui de la session (`org-1002-pattes` par défaut) doit être refusée —
  // entièrement, zone comprise (écriture imbriquée, une seule transaction).
  const [cityRow] = await sql`SELECT "organizationId" FROM "City" WHERE name = ${cityName}`;
  const [zoneRow] = await sql`SELECT "organizationId" FROM "Zone" WHERE name = ${`${MARKER} Zone`}`;

  expect(cityRow, `la commune ne s'est pas enregistrée au nom d'un autre cabinet (réponse : ${result.raw.slice(0, 300)})`).toBeUndefined();
  expect(zoneRow, "la zone n'est pas restée seule, sans ses communes, dans le cabinet B").toBeUndefined();
});

// ---------------------------------------------------------------------------
// SEC-10 : un rendez-vous du cabinet A référence un client du cabinet B.
// ---------------------------------------------------------------------------

test.describe("SEC-10 — identifiants étrangers enregistrés sans être revérifiés", () => {
  let appointmentId = "";

  test.afterAll(async () => {
    if (appointmentId) await sql`DELETE FROM "Appointment" WHERE id = ${appointmentId}`;
  });

  test("le cabinet A peut créer un rendez-vous qui référence un client du cabinet B", async () => {
    const cookie = practitionerCookie();
    const ids = await actionIdsWithCookie("/dashboard/agenda", cookie);
    expect(ids.saveAppointmentAction, "action saveAppointmentAction trouvée").toBeTruthy();

    const date = new Date(Date.now() + 200 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10); // loin dans le futur : aucune chance de heurter un autre test
    const result = await callAction(
      ids.saveAppointmentAction,
      [{
        date, start: "11:00", duration: 30,
        clientId: id("client"), clientName: `Client ${MARKER}`,
        animalId: id("animal"), animalName: `${MARKER}Filou`,
        serviceName: "Ostéopathie", mode: "cabinet", location: "Cabinet",
        price: 0, status: "confirmed", notes: "",
      }],
      "/dashboard/agenda",
      cookie,
    );
    const value = result.value as { ok?: boolean; appointment?: { id: string } } | undefined;
    expect(value?.ok, `le rendez-vous s'est créé (réponse : ${result.raw.slice(0, 300)})`).toBe(true);
    appointmentId = value?.appointment?.id ?? "";
    expect(appointmentId, "identifiant du rendez-vous créé").toBeTruthy();

    const [row] = await sql`SELECT "organizationId", "clientId" FROM "Appointment" WHERE id = ${appointmentId}`;
    expect(row.organizationId, "le rendez-vous reste au cabinet A").toBe("org-1002-pattes");
    expect(row.clientId, "mais pointe bien vers le client du cabinet B — lien jamais revérifié").toBe(id("client"));
  });

  test("la seconde barrière empêche de relire la fiche liée malgré le lien créé", async () => {
    const cookie = practitionerCookie();
    const ids = await actionIdsWithCookie("/dashboard/clients", cookie);
    expect(ids.upcomingAppointmentsOfClientsAction, "action upcomingAppointmentsOfClientsAction trouvée").toBeTruthy();

    const result = await callAction(ids.upcomingAppointmentsOfClientsAction, [[id("client")]], "/dashboard/clients", cookie);
    // Le client du cabinet B reste invisible depuis le cabinet A : la lecture
    // est filtrée par cabinet, même pour un identifiant détenu en main.
    expect(result.value, `la fiche du cabinet B reste invisible (réponse : ${result.raw.slice(0, 300)})`).toEqual([]);
  });
});
