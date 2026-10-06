import { expect, test, type Page } from "@playwright/test";
import { config } from "dotenv";
import { neon } from "./helpers/sql";

config({ path: ".env.local" });
const sql = neon(process.env.DATABASE_URL!);

/**
 * Visite multi-animaux (chantier C6, phase 2) : deux chevaux du même client,
 * cochés dans « Nouveau rendez-vous », chacun avec sa durée — deux
 * rendez-vous enchaînés, sans trajet entre eux, le trajet après le dernier.
 * Et tout ou rien : si le second ne passe pas, rien n'est créé.
 *
 * Fiche, horaires (trajet 30 min) et rendez-vous de test : rétablis à la fin.
 */
const CLIENT_ID = "e2e-visit-client";
const OTHER_ID = "e2e-visit-other";
const DAY = new Date(Date.now() + 40 * 24 * 3600_000).toISOString().slice(0, 10);
const DAY_BLOCKED = new Date(Date.now() + 41 * 24 * 3600_000).toISOString().slice(0, 10);

let savedAvailability: unknown = null;

async function cleanup() {
  await sql`DELETE FROM "Appointment" WHERE "clientId" = ${CLIENT_ID} OR id = ${OTHER_ID}`;
  await sql`DELETE FROM "Animal" WHERE "clientId" = ${CLIENT_ID}`;
  await sql`DELETE FROM "Client" WHERE id = ${CLIENT_ID}`;
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await cleanup();
  const [profile] = await sql`SELECT availability FROM "BusinessProfile" WHERE "organizationId" = 'org-1002-pattes'`;
  savedAvailability = profile.availability;
  const availability = { ...(profile.availability as object), travelBuffer: 30, breakAfterAppointment: 0 };
  await sql`UPDATE "BusinessProfile" SET availability = ${JSON.stringify(availability)}::jsonb WHERE "organizationId" = 'org-1002-pattes'`;
  await sql`INSERT INTO "Client" (id, "firstName", "lastName", phone, email, city, address, "updatedAt") VALUES (${CLIENT_ID}, 'Hortense', 'Haras', '06 10 20 30 40', '', 'Yvetot', '12 route du Haras', now())`;
  for (const name of ["Bucéphale", "Tornade"]) {
    await sql`INSERT INTO "Animal" (id, "clientId", name, species, breed, age, weight, sex, avatar, "avatarBackground", history, conditions, treatments, notes, "updatedAt") VALUES (${`e2e-visit-${name}`}, ${CLIENT_ID}, ${name}, 'Cheval', '', '', '', '', '', '', '', '', '', '', now())`;
  }
});

test.afterAll(async () => {
  await cleanup();
  if (savedAvailability) await sql`UPDATE "BusinessProfile" SET availability = ${JSON.stringify(savedAvailability)}::jsonb WHERE "organizationId" = 'org-1002-pattes'`;
});

/** « Nouveau rendez-vous » depuis la fiche, les deux chevaux cochés, à domicile. */
async function openVisit(page: Page, day: string) {
  await page.goto(`/dashboard/clients/${CLIENT_ID}`);
  await page.getByRole("button", { name: "Nouveau rendez-vous" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Nouveau rendez-vous" });
  const animals = dialog.getByRole("group", { name: "Animaux du rendez-vous" });
  // L'animal de la fiche est déjà coché ; on coche l'autre.
  await expect(animals.getByRole("checkbox", { name: /Bucéphale/ })).toBeChecked();
  await animals.getByText("Tornade").click();
  await expect(animals.getByRole("checkbox", { name: /Tornade/ })).toBeChecked();
  await dialog.getByRole("button", { name: "Domicile", exact: true }).click();
  await dialog.getByLabel("Date", { exact: true }).fill(day);
  await dialog.getByLabel("Heure", { exact: true }).fill("10:00");
  await dialog.getByLabel("Durée pour Bucéphale").selectOption("50");
  await dialog.getByLabel("Durée pour Tornade").selectOption("45");
  return dialog;
}

test("deux chevaux, 50 + 45 min à domicile : deux rendez-vous enchaînés, le trajet après le second", async ({ page }) => {
  const dialog = await openVisit(page, DAY);
  const plan = dialog.getByRole("region", { name: "Déroulé de la visite" });
  await expect(plan.getByRole("listitem").nth(1)).toContainText("10:50");
  await expect(plan).toContainText("Durée totale : 1 h 35 · fin à 11:35");
  await expect(dialog.getByRole("complementary", { name: "Aperçu du rendez-vous" })).toContainText("10:00 → 11:35");

  await dialog.getByRole("button", { name: "Créer 2 rendez-vous" }).click();
  await expect(page.getByText("2 rendez-vous créés (Bucéphale, Tornade)")).toBeVisible({ timeout: 15000 });

  const rows = await sql`SELECT "animalName", start, duration, mode::text AS mode, "visitGroupId" FROM "Appointment" WHERE "clientId" = ${CLIENT_ID} AND date = ${DAY}::date ORDER BY start`;
  expect(rows.map((row) => [row.animalName, row.start, row.duration, row.mode])).toEqual([["Bucéphale", "10:00", 50, "DOMICILE"], ["Tornade", "10:50", 45, "DOMICILE"]]);
  expect(rows[0].visitGroupId, "une seule visite").toBeTruthy();
  expect(rows[1].visitGroupId).toBe(rows[0].visitGroupId);

  // Le créneau suivant : 11 h 35 + 30 min de trajet. 11 h 55 est occupé, 12 h 05 libre.
  await page.goto(`/dashboard/clients/${CLIENT_ID}`);
  await page.getByRole("button", { name: "Nouveau rendez-vous" }).first().click();
  const next = page.getByRole("dialog", { name: "Nouveau rendez-vous" });
  await next.getByRole("button", { name: "Domicile", exact: true }).click();
  await next.getByLabel("Date", { exact: true }).fill(DAY);
  await next.getByLabel("Heure", { exact: true }).fill("11:55");
  await expect(next.getByRole("status").filter({ hasText: "Conflit avec un rendez-vous existant" })).toBeVisible({ timeout: 10000 });
  await next.getByLabel("Heure", { exact: true }).fill("12:05");
  await expect(next.getByRole("status").filter({ hasText: "Créneau disponible" })).toBeVisible({ timeout: 10000 });
});

test("si le second rendez-vous chevauche un rendez-vous existant, rien n'est créé", async ({ page }) => {
  // Un rendez-vous au cabinet à 11 h 30 : le premier cheval (10 h – 10 h 50, puis trajet jusqu'à 11 h 20) passe, le second (10 h 50 – 11 h 35) non.
  await sql`INSERT INTO "Appointment" (id, date, start, duration, "clientName", "animalName", "serviceName", mode, location, price, status, notes, "updatedAt")
    VALUES (${OTHER_ID}, ${`${DAY_BLOCKED}T00:00:00.000Z`}, '11:30', 30, 'E2E Autre client', 'Rex', 'Séance', 'CABINET', 'Cabinet', 50, 'CONFIRMED', '', now())`;
  const dialog = await openVisit(page, DAY_BLOCKED);
  await dialog.getByRole("button", { name: "Créer 2 rendez-vous" }).click();
  await expect(dialog.getByRole("alert")).toContainText("Le rendez-vous de Tornade (10:50) chevaucherait un autre rendez-vous. Rien n’a été créé");
  const [count] = await sql`SELECT count(*)::int AS n FROM "Appointment" WHERE "clientId" = ${CLIENT_ID} AND date = ${DAY_BLOCKED}::date`;
  expect(count.n, "tout ou rien : pas même le premier").toBe(0);
});
