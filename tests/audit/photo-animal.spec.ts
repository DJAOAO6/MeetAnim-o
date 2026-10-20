import sharp from "sharp";
import { expect, test } from "../helpers/test";
import { neon } from "../helpers/sql";
import { config } from "dotenv";

config({ path: ".env.local" });
const sql = neon(process.env.DATABASE_URL!);

/**
 * Chantier 14 des correctifs de l'audit 2026-10 — photo d'un animal
 * enregistrée en base (RGPD-12), et reprise de celles qu'une version
 * précédente gardait dans le navigateur.
 *
 * Session du praticien de test (tests/auth.setup.ts). Tout ce qui est créé
 * porte l'identifiant « audit-photo-… » et est supprimé à la fin.
 */
test.use({ storageState: "tests/.auth/practitioner.json" });

const ORG = "org-1002-pattes";
const id = (suffix: string) => `audit-photo-${suffix}`;
const STORAGE_KEY = "animeo-animal-photos-v1";

async function cleanup() {
  await sql`DELETE FROM "AuditLog" WHERE "entityId" LIKE ${"audit-photo-%"}`;
  await sql`DELETE FROM "Animal" WHERE id LIKE ${"audit-photo-%"}`;
  await sql`DELETE FROM "Client" WHERE id LIKE ${"audit-photo-%"}`;
}

async function insertClientWithAnimal(suffix: string) {
  await sql`INSERT INTO "Client" (id, "organizationId", "firstName", "lastName", phone, email, city, address, "updatedAt") VALUES (${id(suffix)}, ${ORG}, 'Photo', ${`Audit${suffix}`}, '', '', 'Rouen', '', now())`;
  await sql`INSERT INTO "Animal" (id, "organizationId", "clientId", name, species, breed, age, weight, sex, avatar, "avatarBackground", history, conditions, treatments, notes, "updatedAt") VALUES (${id(`animal-${suffix}`)}, ${ORG}, ${id(suffix)}, 'Mistigri', 'Chat', '', '', '', '', '', '', '', '', '', '', now())`;
}

test.describe.configure({ mode: "serial" });
test.beforeAll(cleanup);
test.afterAll(cleanup);

test("RGPD-12 — la photo ajoutée sur la fiche est enregistrée en base, pas dans le navigateur", async ({ page }) => {
  await insertClientWithAnimal("ajout");
  const photo = await sharp({ create: { width: 200, height: 200, channels: 3, background: "#a0522d" } }).jpeg().toBuffer();

  await page.goto(`/dashboard/clients/${id("ajout")}`);
  await page.locator('input[type="file"][accept="image/png,image/jpeg,image/webp"]').setInputFiles({ name: "mistigri.jpg", mimeType: "image/jpeg", buffer: photo });
  await expect(page.getByText("Photo de l’animal enregistrée.")).toBeVisible({ timeout: 15000 });

  const [row] = await sql`SELECT photo FROM "Animal" WHERE id = ${id("animal-ajout")}`;
  expect(String(row.photo ?? "").startsWith("data:image/"), "photo en base").toBe(true);
  expect(await page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY), "rien dans le navigateur").toBeNull();
});

test("RGPD-12 — une photo laissée dans le navigateur par l'ancienne version part en base, puis le quitte", async ({ page }) => {
  await insertClientWithAnimal("reprise");
  const legacy = `data:image/jpeg;base64,${(await sharp({ create: { width: 40, height: 40, channels: 3, background: "#336699" } }).jpeg().toBuffer()).toString("base64")}`;

  await page.goto("/dashboard");
  await page.evaluate(([key, value]) => window.localStorage.setItem(key, value), [STORAGE_KEY, JSON.stringify({ [`${id("reprise")}:${id("animal-reprise")}`]: legacy })]);
  await page.goto(`/dashboard/clients/${id("reprise")}`);

  await expect.poll(async () => (await sql`SELECT photo FROM "Animal" WHERE id = ${id("animal-reprise")}`)[0].photo, { timeout: 15000 }).toBe(legacy);
  await expect.poll(() => page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY)).toBeNull();
});
