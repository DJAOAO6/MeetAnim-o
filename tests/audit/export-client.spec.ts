import { readFileSync } from "node:fs";
import { strFromU8, unzipSync } from "fflate";
import { expect, test } from "../helpers/test";
import { neon } from "../helpers/sql";
import { config } from "dotenv";
import { BASE_URL } from "../helpers/base-url";

config({ path: ".env.local" });
const sql = neon(process.env.DATABASE_URL!);
const BASE = BASE_URL;

/**
 * Chantier 12 des correctifs de l'audit 2026-10 — export des données d'un
 * client (RGPD-07, src/app/api/clients/[id]/export/route.ts).
 *
 * Tout ce qui est créé porte l'identifiant « audit-export-… » et est
 * supprimé à la fin.
 */

const ORG = "org-1002-pattes";
const OTHER = "audit-export-autre-cabinet";
const id = (suffix: string) => `audit-export-${suffix}`;
const PDF = `data:application/pdf;filename=generated.pdf;base64,${Buffer.from("%PDF-1.3\n%%EOF").toString("base64")}`;

function practitionerCookie(): string {
  const state = JSON.parse(readFileSync("tests/.auth/practitioner.json", "utf8")) as { cookies: { name: string; value: string }[] };
  return state.cookies.map((c) => `${c.name}=${c.value}`).join("; ");
}

async function cleanup() {
  await sql`DELETE FROM "StudioDocument" WHERE id LIKE ${"audit-export-%"}`;
  await sql`DELETE FROM "Appointment" WHERE id LIKE ${"audit-export-%"}`;
  await sql`DELETE FROM "Animal" WHERE id LIKE ${"audit-export-%"}`;
  await sql`DELETE FROM "Client" WHERE id LIKE ${"audit-export-%"}`;
  await sql`DELETE FROM "AuditLog" WHERE "entityId" LIKE ${"audit-export-%"}`;
  await sql`DELETE FROM "Organization" WHERE id = ${OTHER}`;
}

test.describe.configure({ mode: "serial" });
test.beforeAll(async () => {
  await cleanup();
  const [user] = await sql`SELECT id FROM "User" WHERE email = 'praticien-test@pf-osteo-animale.fr'`;
  await sql`INSERT INTO "Client" (id, "organizationId", "firstName", "lastName", phone, email, city, address, "updatedAt") VALUES (${id("client")}, ${ORG}, 'Hélène', 'ExportAudit', '01 99 00 66 66', 'audit-export@example.fr', 'Rouen', '3 rue Fictive', now())`;
  await sql`INSERT INTO "Animal" (id, "organizationId", "clientId", name, species, breed, age, weight, sex, avatar, "avatarBackground", history, conditions, treatments, notes, "updatedAt") VALUES (${id("animal")}, ${ORG}, ${id("client")}, 'Pistache', 'Chat', '', '', '', '', '', '', 'Boiterie 2025', '', '', '', now())`;
  await sql`INSERT INTO "Appointment" (id, "organizationId", "clientId", "animalId", "clientName", "animalName", "serviceName", date, start, duration, mode, location, price, status, notes, "updatedAt") VALUES (${id("rdv")}, ${ORG}, ${id("client")}, ${id("animal")}, 'Hélène ExportAudit', 'Pistache', 'Ostéopathie', ${new Date("2026-03-02T00:00:00.000Z")}, '10:00', 45, 'CABINET', 'Cabinet', 55, 'COMPLETED', '', now())`;
  await sql`INSERT INTO "StudioDocument" (id, "organizationId", title, status, "clientId", "animalId", "createdByUserId", "contentJson", "pdfBase64", "finalizedAt", "updatedAt") VALUES (${id("cr")}, ${ORG}, 'Compte rendu Pistache', 'FINALIZED', ${id("client")}, ${id("animal")}, ${user.id}, '{"pages":[]}'::jsonb, ${PDF}, now(), now())`;
  // Un client d'un autre cabinet.
  await sql`INSERT INTO "Organization" (id, name, "createdAt", "updatedAt") VALUES (${OTHER}, 'Autre cabinet (audit export)', now(), now())`;
  await sql`INSERT INTO "Client" (id, "organizationId", "firstName", "lastName", phone, email, city, address, "updatedAt") VALUES (${id("etranger")}, ${OTHER}, 'Autre', 'Cabinet', '', 'audit-export-autre@example.fr', 'Dieppe', '', now())`;
});
test.afterAll(cleanup);

test("RGPD-07 — le professionnel exporte les données d'un client", async () => {
  const response = await fetch(`${BASE}/api/clients/${id("client")}/export`, { headers: { Cookie: practitionerCookie() } });
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("application/zip");
  const files = unzipSync(new Uint8Array(await response.arrayBuffer()));

  const data = JSON.parse(strFromU8(files["client.json"])) as { lastName: string; animals: Array<{ name: string; history: string }>; appointments: Array<{ serviceName: string }>; comptesRendus: Array<{ pdf: string | null }> };
  expect(data.lastName).toBe("ExportAudit");
  expect(data.animals[0]).toMatchObject({ name: "Pistache", history: "Boiterie 2025" });
  expect(data.appointments).toHaveLength(1);
  expect(strFromU8(files["rendez-vous.csv"])).toContain("Ostéopathie");
  const pdfPath = data.comptesRendus[0]?.pdf;
  expect(pdfPath, "le compte rendu finalisé est joint").toBeTruthy();
  expect(strFromU8(files[pdfPath!]).startsWith("%PDF-")).toBe(true);
});

test("RGPD-07 — ni un visiteur, ni un autre cabinet ne l'obtiennent", async () => {
  const anonymous = await fetch(`${BASE}/api/clients/${id("client")}/export`, { redirect: "manual" });
  expect(anonymous.status, "sans compte").toBe(404);
  const foreign = await fetch(`${BASE}/api/clients/${id("etranger")}/export`, { headers: { Cookie: practitionerCookie() } });
  expect(foreign.status, "client d'un autre cabinet").toBe(404);
});
