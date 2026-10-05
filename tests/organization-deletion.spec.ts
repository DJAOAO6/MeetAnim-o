import { expect, test, type Page } from "@playwright/test";
import { unzipSync, strFromU8 } from "fflate";
import { readFile } from "node:fs/promises";
import { neon } from "./helpers/sql";
import { createPlatformAccount, loginAsPlatform, removePlatformAccount } from "./helpers/platform";
import { config } from "dotenv";

config({ path: ".env.local" });

/**
 * Suppression d'un espace (chantier C9) : export, programmation, annulation,
 * échéance, effacement immédiat — vérifiés en base, pas à l'écran.
 *
 * L'effacement ne s'exécute que sur une base de test : ce fichier ne tourne
 * que si DATABASE_URL désigne une base « _test » (et le serveur refuserait
 * de toute façon ailleurs, voir purgeAllowed). Lancement :
 *   DATABASE_URL=<base de test> E2E_PORT=3200 npx playwright test tests/organization-deletion.spec.ts --project=chromium
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
const PLATFORM_EMAIL = "plateforme-suppression-e2e@example.fr";
const CRON_SECRET = process.env.CRON_SECRET ?? "e2e-cron-local";
const PDF = Buffer.from("%PDF-1.4\n% compte rendu e2e\n").toString("base64");

let platformId = "";

/** Un espace complet, prêt à être effacé. */
async function createOrganization(key: string, name: string) {
  const org = `e2e-del-${key}`;
  await removeOrganization(org);
  await sql`INSERT INTO "Organization" (id, name, "onboardedAt", "createdAt", "updatedAt") VALUES (${org}, ${name}, now(), now(), now())`;
  await sql`INSERT INTO "User" (id, email, "passwordHash", "firstName", "lastName", role, permissions, "organizationId", "updatedAt")
    VALUES (${`${org}-pro`}, ${`${org}@example.fr`}, 'x', 'Pro', ${name}, 'ADMIN', ARRAY[]::text[], ${org}, now())`;
  await sql`INSERT INTO "BusinessProfile" (id, "organizationId", slug, "firstName", "lastName", profession, company, phone, email, address, "postalCode", city, location, bio, photo, logo, "publicColor", "updatedAt")
    VALUES (${`${org}-profil`}, ${org}, ${org}, 'Pro', ${name}, 'Ostéopathe', ${name}, '', '', '', '', '', '', '', '', '', '#a0522d', now())`;
  await sql`INSERT INTO "Client" (id, "organizationId", "firstName", "lastName", phone, email, city, address, "updatedAt")
    VALUES (${`${org}-client`}, ${org}, 'Clémence', 'Exportée', '0600000000', ${`client-${org}@example.fr`}, 'Rouen', '1 rue du Test', now())`;
  await sql`INSERT INTO "Animal" (id, "organizationId", "clientId", name, species, breed, age, weight, sex, avatar, "avatarBackground", history, conditions, treatments, notes, "updatedAt")
    VALUES (${`${org}-animal`}, ${org}, ${`${org}-client`}, 'Filou', 'Chien', '', '', '', '', '', '', '', '', '', '', now())`;
  await sql`INSERT INTO "Appointment" (id, "organizationId", "clientId", "animalId", "clientName", "animalName", "serviceName", date, start, duration, mode, location, price, status, notes, "createdAt", "updatedAt")
    VALUES (${`${org}-rdv`}, ${org}, ${`${org}-client`}, ${`${org}-animal`}, 'Clémence Exportée', 'Filou', 'Séance', now()::date + 3, '10:00', 45, 'CABINET', 'Cabinet', 60, 'CONFIRMED', '', now(), now())`;
  await sql`INSERT INTO "StudioDocument" (id, "organizationId", title, "clientId", "animalId", "createdByUserId", "contentJson", "pdfBase64", "updatedAt")
    VALUES (${`${org}-doc`}, ${org}, 'Compte rendu Filou', ${`${org}-client`}, ${`${org}-animal`}, ${`${org}-pro`}, '{}'::jsonb, ${`data:application/pdf;base64,${PDF}`}, now())`;
  return org;
}

async function removeOrganization(org: string) {
  for (const table of ["StudioDocument", "Appointment", "Animal", "Client", "BusinessProfile", "AuditLog"]) {
    await sql(Object.assign([`DELETE FROM "${table}" WHERE "organizationId" = `, ""], { raw: [] }) as TemplateStringsArray, org);
  }
  await sql`DELETE FROM "Session" WHERE "userId" IN (SELECT id FROM "User" WHERE "organizationId" = ${org})`;
  await sql`DELETE FROM "User" WHERE "organizationId" = ${org}`;
  await sql`DELETE FROM "Organization" WHERE id = ${org}`;
}

async function exists(org: string) {
  const [row] = await sql`SELECT count(*)::int AS n FROM "Organization" WHERE id = ${org}`;
  return row.n === 1;
}

function region(page: Page, name: string) {
  return page.getByRole("region", { name: new RegExp(`^${name}`) });
}

async function openDeletion(page: Page, name: string) {
  await page.goto("/plateforme", { waitUntil: "networkidle" });
  await region(page, name).getByRole("button", { name: "Supprimer l’espace…" }).click();
  const dialog = page.getByRole("dialog", { name: `Supprimer ${name}` });
  await expect(dialog).toBeVisible();
  return dialog;
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  platformId = await createPlatformAccount(sql, PLATFORM_EMAIL);
});

test.afterAll(async () => {
  for (const key of ["prog", "now"]) await removeOrganization(`e2e-del-${key}`);
  await removePlatformAccount(sql, PLATFORM_EMAIL);
});

test("export, programmation, annulation, puis effacement à l'échéance", async ({ page }) => {
  test.setTimeout(150_000);
  const name = "E2E Suppression Programmée";
  const org = await createOrganization("prog", name);
  await loginAsPlatform(page, sql, platformId, PLATFORM_EMAIL);

  // Inventaire et export.
  let dialog = await openDeletion(page, name);
  await expect(dialog.getByRole("region", { name: "Ce qui sera effacé" })).toContainText("1 client");
  const [download] = await Promise.all([page.waitForEvent("download"), dialog.getByRole("link", { name: "Télécharger l’export" }).click()]);
  const files = unzipSync(new Uint8Array(await readFile((await download.path())!)));
  expect(strFromU8(files["clients.csv"])).toContain("Clémence;Exportée");
  expect(strFromU8(files["donnees/Animal.json"])).toContain("Filou");
  expect(Object.keys(files).some((path) => path.startsWith("documents/") && path.endsWith(".pdf")), "le compte rendu en PDF").toBe(true);
  expect(strFromU8(files["comptes.json"])).not.toContain("passwordHash");

  // Programmation : motif et nom exact exigés.
  await dialog.getByRole("button", { name: "Programmer la suppression" }).click();
  await expect(dialog.getByRole("alert")).toContainText("motif");
  await dialog.getByLabel("Motif").selectOption("CONTRACT_END");
  await dialog.getByLabel("Nom de l’espace, à taper à l’identique").fill("Mauvais nom");
  await dialog.getByRole("button", { name: "Programmer la suppression" }).click();
  await expect(dialog.getByRole("alert")).toContainText("nom exact");
  await dialog.getByLabel("Nom de l’espace, à taper à l’identique").fill(name);
  await dialog.getByRole("button", { name: "Programmer la suppression" }).click();
  await expect(region(page, name)).toContainText(/Suppression prévue le/);
  const [scheduled] = await sql`SELECT "suspendedAt", "deletionScheduledFor" FROM "Organization" WHERE id = ${org}`;
  expect(scheduled.suspendedAt, "suspendu aussitôt").not.toBeNull();
  expect(new Date(scheduled.deletionScheduledFor).getTime() - Date.now()).toBeGreaterThan(6.9 * 24 * 3600_000);
  const [record] = await sql`SELECT reason::text, "purgedAt" FROM "DeletionRecord" WHERE "organizationHash" = encode(sha256(convert_to(${`organization:${org}`}, 'UTF8')), 'hex')`;
  expect(record).toMatchObject({ reason: "CONTRACT_END", purgedAt: null });

  // Annulation : l'espace reste suspendu, la preuve en attente disparaît.
  await region(page, name).getByRole("button", { name: "Annuler la suppression" }).click();
  await expect(region(page, name)).toContainText(/Suspendu depuis le/);
  const [cancelled] = await sql`SELECT count(*)::int AS n FROM "DeletionRecord" WHERE "organizationHash" = encode(sha256(convert_to(${`organization:${org}`}, 'UTF8')), 'hex')`;
  expect(cancelled.n).toBe(0);

  // De nouveau programmée, puis échéance simulée : la tâche planifiée efface.
  dialog = await openDeletion(page, name);
  await dialog.getByLabel("Motif").selectOption("PROFESSIONAL_REQUEST");
  await dialog.getByLabel("Nom de l’espace, à taper à l’identique").fill(name);
  await dialog.getByRole("button", { name: "Programmer la suppression" }).click();
  await expect(region(page, name)).toContainText(/Suppression prévue le/);
  await sql`UPDATE "Organization" SET "deletionScheduledFor" = now() - interval '1 minute' WHERE id = ${org}`;
  const response = await page.request.get(`/api/cron/daily?organization=${org}`, { headers: { Authorization: `Bearer ${CRON_SECRET}` } });
  expect((await response.json()).organizationsPurged).toBe(1);
  expect(await exists(org)).toBe(false);
  const [purged] = await sql`SELECT "purgedAt", "rowCounts" FROM "DeletionRecord" WHERE "organizationHash" = encode(sha256(convert_to(${`organization:${org}`}, 'UTF8')), 'hex')`;
  expect(purged.purgedAt).not.toBeNull();
  expect(purged.rowCounts).toMatchObject({ Client: 1, Animal: 1, Appointment: 1, StudioDocument: 1, User: 1, Organization: 1 });
});

test("effacer immédiatement, après une seconde confirmation", async ({ page }) => {
  const name = "E2E Effacement Immédiat";
  const org = await createOrganization("now", name);
  await loginAsPlatform(page, sql, platformId, PLATFORM_EMAIL);
  const dialog = await openDeletion(page, name);
  await dialog.getByLabel("Nom de l’espace, à taper à l’identique").fill(name);
  await dialog.getByRole("checkbox", { name: /Effacer immédiatement/ }).check();
  await dialog.getByRole("button", { name: "Effacer immédiatement…" }).click();
  await expect(dialog.getByRole("alert")).toContainText("Dernière confirmation");
  expect(await exists(org), "rien n'est effacé avant la seconde confirmation").toBe(true);
  await dialog.getByRole("button", { name: "Effacer définitivement maintenant" }).click();
  await expect(dialog).toHaveCount(0, { timeout: 30000 });
  expect(await exists(org)).toBe(false);
  for (const table of ["Client", "Animal", "Appointment", "StudioDocument", "BusinessProfile", "User"]) {
    const [row] = await sql(Object.assign([`SELECT count(*)::int AS n FROM "${table}" WHERE "organizationId" = `, ""], { raw: [] }) as TemplateStringsArray, org);
    expect(row.n, `${table} vide`).toBe(0);
  }
});
