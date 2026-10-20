import { expect, test } from "../helpers/test";
import { neon } from "../helpers/sql";
import { config } from "dotenv";
import { BASE_URL } from "../helpers/base-url";

config({ path: ".env.local" });
const sql = neon(process.env.DATABASE_URL!);
const BASE = BASE_URL;

/**
 * Chantier 10 des correctifs de l'audit 2026-10 — surface publique.
 * Non-régression de SEC-16 (emploi du temps lisible sans borne), SEC-18
 * (flux d'agenda sans borne de date) et SEC-27 (en-têtes de sécurité).
 *
 * Tout ce qui est créé porte l'identifiant « audit-surface-… » et est
 * supprimé à la fin ; le jeton du flux d'agenda reprend sa valeur.
 */

const ORG = "org-1002-pattes";
const PRACTITIONER_EMAIL = "praticien-test@pf-osteo-animale.fr";
const OLD_DATE = "2024-01-15";
const OLD_ID = "audit-surface-ancien";

let slug = "";
let practitionerId = "";
let originalIcsToken: string | null = null;

test.beforeAll(async () => {
  await sql`DELETE FROM "Appointment" WHERE id = ${OLD_ID}`;
  const [profile] = await sql`SELECT slug FROM "BusinessProfile" WHERE "organizationId" = ${ORG}`;
  slug = profile.slug;
  const [user] = await sql`SELECT id, "icsFeedToken" FROM "User" WHERE email = ${PRACTITIONER_EMAIL}`;
  practitionerId = user.id;
  originalIcsToken = user.icsFeedToken;
  await sql`
    INSERT INTO "Appointment" (id, "organizationId", "clientName", "animalName", "serviceName", date, start, duration, mode, location, price, status, notes, "updatedAt")
    VALUES (${OLD_ID}, ${ORG}, 'Client AuditSurface', 'Animal AuditSurface', 'Ostéopathie', ${new Date(`${OLD_DATE}T00:00:00.000Z`)}, '10:00', 45, 'CABINET', 'Cabinet', 0, 'COMPLETED', '', now())`;
});

test.afterAll(async () => {
  await sql`DELETE FROM "Appointment" WHERE id = ${OLD_ID}`;
  await sql`UPDATE "User" SET "icsFeedToken" = ${originalIcsToken} WHERE id = ${practitionerId}`;
});

test("SEC-27 — les en-têtes de sécurité sont posés par l'application", async () => {
  const response = await fetch(`${BASE}/reserver/${slug}`);
  expect(response.status).toBe(200);
  expect(response.headers.get("x-powered-by"), "le framework ne s'annonce plus").toBeNull();
  expect(response.headers.get("x-frame-options")).toBe("DENY");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect(response.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
  expect(response.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
  expect(response.headers.get("permissions-policy")).toContain("camera=()");
});

test("SEC-16 — un visiteur ne lit pas l'emploi du temps hors de la fenêtre de réservation", async () => {
  // L'identifiant de l'action, tiré du JavaScript de la page publique, comme le ferait un visiteur.
  const html = await (await fetch(`${BASE}/reserver/${slug}`)).text();
  let actionId = "";
  for (const chunk of [...new Set(html.match(/\/_next\/static\/[^"'\s]+\.js/g) ?? [])]) {
    const js = await (await fetch(`${BASE}${chunk}`)).text();
    const match = /"([0-9a-f]{40,})":\{"name":"getOccupiedSlotsAction"\}/.exec(js);
    if (match) actionId = match[1];
  }
  expect(actionId, "action getOccupiedSlotsAction trouvée").toBeTruthy();

  const response = await fetch(`${BASE}/reserver/${slug}`, {
    method: "POST",
    headers: { "Next-Action": actionId, "Content-Type": "text/plain;charset=UTF-8", Accept: "text/x-component", Origin: BASE },
    body: JSON.stringify([slug, "2020-01-01", "2035-12-31"]),
  });
  const raw = await response.text();
  expect(response.status, `réponse : ${raw.slice(0, 200)}`).toBe(200);
  // Avant correction : la journée de 2024 figurait dans la réponse.
  expect(raw, "le rendez-vous de 2024 n'est pas renvoyé").not.toContain(OLD_DATE);
});

test("SEC-18 — le flux d'agenda ne publie plus les rendez-vous anciens", async () => {
  const token = `audit-surface-${Date.now()}-flux`;
  await sql`UPDATE "User" SET "icsFeedToken" = ${token} WHERE id = ${practitionerId}`;
  const feed = await fetch(`${BASE}/api/calendar/feed/${token}.ics`);
  expect(feed.status).toBe(200);
  const ics = await feed.text();
  expect(ics, "contrôle : le flux répond bien un calendrier").toContain("BEGIN:VCALENDAR");
  expect(ics, "le rendez-vous de 2024 n'y est plus").not.toContain(`UID:${OLD_ID}@`);
});
