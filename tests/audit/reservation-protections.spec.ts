import { expect, test } from "../helpers/test";
import { neon } from "../helpers/sql";
import { config } from "dotenv";
import { BASE_URL } from "../helpers/base-url";

config({ path: ".env.local" });
const sql = neon(process.env.DATABASE_URL!);
const BASE = BASE_URL;

/**
 * Chantier 16 des correctifs de l'audit 2026-10 — réservation en ligne :
 * rattachement à une fiche existante (RGPD-16) et plafond quotidien par
 * cabinet (SEC-17). Appel direct de l'action, comme un visiteur.
 *
 * Tout ce qui est créé porte le marqueur AUDIT16 et est supprimé à la fin.
 */

const ORG = "org-1002-pattes";
const MARKER = "AUDIT16";
let slug = "";

async function actionIds(path: string): Promise<Record<string, string>> {
  const html = await (await fetch(`${BASE}${path}`)).text();
  const ids: Record<string, string> = {};
  for (const chunk of [...new Set(html.match(/\/_next\/static\/[^"'\s]+\.js/g) ?? [])]) {
    const js = await (await fetch(`${BASE}${chunk}`)).text();
    for (const m of js.matchAll(/"([0-9a-f]{40,})":\{"name":"(\w+)"\}/g)) ids[m[2]] = m[1];
  }
  return ids;
}

async function callAction(id: string, args: unknown[], path: string) {
  const response = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Next-Action": id, "Content-Type": "text/plain;charset=UTF-8", Accept: "text/x-component", Origin: BASE },
    body: JSON.stringify(args),
  });
  const raw = await response.text();
  let value: unknown;
  for (const line of raw.split("\n")) {
    const m = /^1:(\{.*\}|\[.*\])$/.exec(line);
    if (m) { try { value = JSON.parse(m[1]); } catch { /* flux partiel */ } }
  }
  return value as { ok: boolean; id?: string; error?: string } | undefined;
}

/** Une demande valable : un créneau réellement proposé par la page publique. */
async function bookingRequest(ids: Record<string, string>, owner: { lastName: string; email: string }) {
  const [service] = await sql`SELECT id, duration FROM "Service" WHERE "organizationId" = ${ORG} AND active = true AND "cabinetEnabled" = true ORDER BY "createdAt" LIMIT 1`;
  const schedule = await callAction(ids.getPublicScheduleAction, [slug, "cabinet", service.duration], `/reserver/${slug}`) as unknown as { dates: { id: string; slots: string[] }[] };
  const date = [...schedule.dates].reverse().find((d) => d.slots.length > 0);
  if (!date) throw new Error("Aucun créneau libre");
  return {
    serviceId: service.id, date: date.id, start: date.slots[0], mode: "cabinet", location: "Cabinet", notes: `Note ${MARKER}`,
    clientName: `Client ${MARKER}`, animalName: `Rex${MARKER}`, bookingStartedAt: Date.now() - 20_000,
    ownerFirstName: "Audit", ownerLastName: owner.lastName, ownerPhone: "0199007777", ownerEmail: owner.email, animalSpecies: "Chien",
  };
}

async function cleanup() {
  await sql`DELETE FROM "AppointmentSlotOption" WHERE "appointmentId" IN (SELECT id FROM "Appointment" WHERE "clientName" LIKE ${`%${MARKER}%`})`;
  await sql`DELETE FROM "Appointment" WHERE "clientName" LIKE ${`%${MARKER}%`}`;
  await sql`DELETE FROM "Animal" WHERE name LIKE ${`%${MARKER}%`}`;
  await sql`DELETE FROM "Client" WHERE "lastName" LIKE ${`%${MARKER}%`} OR email LIKE ${"audit16-%"}`;
  await sql`DELETE FROM "RateLimitEvent" WHERE key LIKE 'public-booking:%'`;
}

test.describe.configure({ mode: "serial" });
test.beforeAll(async () => {
  await cleanup();
  const [profile] = await sql`SELECT slug FROM "BusinessProfile" WHERE "organizationId" = ${ORG}`;
  slug = profile.slug;
});
test.afterAll(cleanup);

test("RGPD-16 — l'e-mail d'un client ne suffit plus à ranger une demande dans sa fiche", async () => {
  const email = `audit16-victime-${Date.now()}@example.fr`;
  await sql`INSERT INTO "Client" (id, "organizationId", "firstName", "lastName", phone, email, city, address, "archivedAt", "updatedAt") VALUES ('audit16-victime', ${ORG}, 'Camille', ${`Victime${MARKER}`}, '', ${email}, 'Rouen', '', now(), now())`;

  const ids = await actionIds(`/reserver/${slug}`);
  const result = await callAction(ids.submitPublicBookingAction, [slug, await bookingRequest(ids, { lastName: `Autre${MARKER}`, email })], `/reserver/${slug}`);
  expect(result?.ok, `demande acceptée (${result?.error ?? ""})`).toBe(true);

  const [appointment] = await sql`SELECT "clientId" FROM "Appointment" WHERE id = ${result!.id}`;
  expect(appointment.clientId, "rangée dans une nouvelle fiche, pas dans celle du client existant").not.toBe("audit16-victime");
  const [victim] = await sql`SELECT "archivedAt" FROM "Client" WHERE id = 'audit16-victime'`;
  expect(victim.archivedAt, "la fiche existante reste archivée").not.toBeNull();
});

test("SEC-17 — au-delà de 30 demandes en attente sur 24 h, le cabinet n'en reçoit plus en ligne", async () => {
  // 30 demandes en attente reçues aujourd'hui, loin dans le futur et hors des heures proposées.
  for (let n = 0; n < 30; n++) {
    await sql`INSERT INTO "Appointment" (id, "organizationId", "clientName", "animalName", "serviceName", date, start, duration, mode, location, price, status, notes, "updatedAt") VALUES (${`audit16-plafond-${n}`}, ${ORG}, ${`Client ${MARKER}`}, 'Rex', 'Ostéopathie', ${new Date(Date.UTC(2030, 0, 1 + n))}, '05:00', 30, 'CABINET', 'Cabinet', 0, 'PENDING', '', now())`;
  }
  await sql`DELETE FROM "RateLimitEvent" WHERE key LIKE 'public-booking:%'`;

  const ids = await actionIds(`/reserver/${slug}`);
  const result = await callAction(ids.submitPublicBookingAction, [slug, await bookingRequest(ids, { lastName: `Plafond${MARKER}`, email: `audit16-plafond-${Date.now()}@example.fr` })], `/reserver/${slug}`);
  expect(result?.ok, "refusée").toBe(false);
  expect(result?.error).toContain("beaucoup de demandes");
});
