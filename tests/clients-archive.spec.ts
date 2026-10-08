import { expect, test } from "@playwright/test";
import { config } from "dotenv";
import { neon } from "./helpers/sql";

config({ path: ".env.local" });
const sql = neon(process.env.DATABASE_URL!);

/**
 * Archivage des clients (chantier C5, phase 3) : une fiche archivée sort de
 * la liste et de la recherche, reste sous « Archivés », se restaure ; en
 * groupe avec « Annuler » ; et un client archivé qui réserve en ligne
 * revient de lui-même.
 *
 * Deux fiches dédiées, supprimées à la fin.
 */
const A = { id: "e2e-archive-a", firstName: "Archibald", lastName: "Archivable", email: "e2e-archive-a@example.fr" };
const B = { id: "e2e-archive-b", firstName: "Bérénice", lastName: "Bulkarchive", email: "e2e-archive-b@example.fr" };
const APPOINTMENT_ID = "e2e-archive-appointment";

async function cleanup() {
  await sql`DELETE FROM "Appointment" WHERE "clientId" IN (${A.id}, ${B.id}) OR id = ${APPOINTMENT_ID}`;
  await sql`DELETE FROM "Animal" WHERE "clientId" IN (${A.id}, ${B.id})`;
  await sql`DELETE FROM "AuditLog" WHERE "entityId" IN (${A.id}, ${B.id})`;
  await sql`DELETE FROM "Client" WHERE id IN (${A.id}, ${B.id})`;
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await cleanup();
  for (const client of [A, B]) {
    await sql`INSERT INTO "Client" (id, "firstName", "lastName", phone, email, city, address, "updatedAt") VALUES (${client.id}, ${client.firstName}, ${client.lastName}, '06 11 22 33 44', ${client.email}, 'Rouen', '1 rue de l’Archive', now())`;
  }
  await sql`INSERT INTO "Animal" (id, "clientId", name, species, breed, age, weight, sex, avatar, "avatarBackground", history, conditions, treatments, notes, "updatedAt") VALUES ('e2e-archive-animal', ${A.id}, 'ArchiRex', 'Chien', '', '', '', '', '', '', '', '', '', '', now())`;
  // Un rendez-vous à venir : l'archivage l'annonce, et ne l'annule pas.
  const day = new Date(Date.now() + 10 * 24 * 3600_000).toISOString().slice(0, 10);
  await sql`INSERT INTO "Appointment" (id, date, start, duration, "clientId", "clientName", "animalName", "serviceName", mode, location, price, status, notes, "updatedAt")
    VALUES (${APPOINTMENT_ID}, ${`${day}T00:00:00.000Z`}, '10:00', 45, ${A.id}, 'Archibald Archivable', 'ArchiRex', 'Séance', 'CABINET', 'Cabinet', 60, 'CONFIRMED', '', now())`;
});

test.afterAll(cleanup);

test("archiver depuis la fiche : absent de la liste et de la recherche, présent sous « Archivés », puis restauré", async ({ page }) => {
  await page.goto(`/dashboard/clients/${A.id}`);
  // Sur la fiche, la question est posée dans une fenêtre du logiciel.
  await page.getByRole("button", { name: "Archiver", exact: true }).click();
  const question = page.getByRole("dialog", { name: "Archiver ce client ?" });
  await expect(question).toContainText("Archiver la fiche de Archibald Archivable ?");
  await expect(question).toContainText("Archibald Archivable a 1 rendez-vous à venir.");
  await expect(question).toContainText("Il est conservé.");
  await question.getByRole("button", { name: "Archiver", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: /Client archivé le/ })).toBeVisible();

  const [row] = await sql`SELECT "archivedAt" FROM "Client" WHERE id = ${A.id}`;
  expect(row.archivedAt).not.toBeNull();
  const [appointment] = await sql`SELECT status FROM "Appointment" WHERE id = ${APPOINTMENT_ID}`;
  expect(appointment.status, "le rendez-vous est conservé").toBe("CONFIRMED");
  const [audit] = await sql`SELECT count(*)::int AS n FROM "AuditLog" WHERE "entityId" = ${A.id} AND action = 'CLIENT_ARCHIVED'`;
  expect(audit.n).toBe(1);

  await page.goto("/dashboard/clients");
  await expect(page.getByText("Archibald Archivable")).toHaveCount(0);
  // Ni dans la recherche de l'en-tête.
  await page.getByRole("combobox", { name: "Rechercher un client, un animal" }).fill("archibald");
  await expect(page.getByRole("option", { name: /Archibald/ })).toHaveCount(0);
  await page.keyboard.press("Escape");
  // Mais sous « Archivés ».
  await page.getByLabel("Statut").selectOption("Archivés");
  await expect(page.getByText("Archibald Archivable").first()).toBeVisible();
  await expect(page.getByText("Client archivé").first()).toBeVisible();

  await page.goto(`/dashboard/clients/${A.id}`);
  await page.getByRole("button", { name: "Restaurer" }).click();
  await expect(page.getByRole("status").filter({ hasText: /Client archivé le/ })).toHaveCount(0);
  await page.goto("/dashboard/clients");
  await expect(page.getByText("Archibald Archivable").first()).toBeVisible();
});

test("archivage groupé, puis « Annuler » dans le message", async ({ page }) => {
  await page.goto("/dashboard/clients");
  await page.getByRole("button", { name: "Sélectionner", exact: true }).click();
  await page.getByRole("checkbox", { name: "Sélectionner Archibald Archivable" }).check();
  await page.getByRole("checkbox", { name: "Sélectionner Bérénice Bulkarchive" }).check();
  await page.getByRole("button", { name: "Archiver", exact: true }).click();
  // La question est posée dans une fenêtre du logiciel, comme sur la fiche.
  const question = page.getByRole("dialog", { name: "Archiver ces clients ?" });
  await expect(question).toContainText("Archiver ces 2 fiches clients ?");
  await question.getByRole("button", { name: "Archiver", exact: true }).click();
  await expect(page.getByText("2 clients archivés.")).toBeVisible();
  await expect(page.getByText("Bérénice Bulkarchive")).toHaveCount(0);
  const archived = await sql`SELECT count(*)::int AS n FROM "Client" WHERE id IN (${A.id}, ${B.id}) AND "archivedAt" IS NOT NULL`;
  expect(archived[0].n).toBe(2);

  await page.getByRole("button", { name: "Annuler" }).click();
  await expect(page.getByText("2 clients restaurés.")).toBeVisible();
  await expect(page.getByText("Bérénice Bulkarchive").first()).toBeVisible();
  const restored = await sql`SELECT count(*)::int AS n FROM "Client" WHERE id IN (${A.id}, ${B.id}) AND "archivedAt" IS NULL`;
  expect(restored[0].n).toBe(2);
});

test("un client archivé qui réserve en ligne revient dans la liste", async ({ browser }) => {
  test.setTimeout(90_000);
  await sql`UPDATE "Client" SET "archivedAt" = now() WHERE id = ${A.id}`;
  const visitor = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  try {
    const page = await visitor.newPage();
    await page.goto("/reserver/pauline-faucillon");
    await page.getByText("Ostéopathie canine").first().click();
    await page.getByText("Au cabinet", { exact: true }).click();
    await page.getByRole("button", { name: "Continuer" }).click();
    await page.waitForTimeout(600);
    await page.locator('[role="gridcell"][aria-disabled="false"]').first().click();
    await page.waitForTimeout(500);
    await page.locator("button", { hasText: /^\d{2}:\d{2}$/ }).first().click();
    await page.getByRole("button", { name: "Continuer" }).click();
    await page.waitForTimeout(600);
    await page.locator("#booking-details-firstName").fill(A.firstName);
    await page.locator("#booking-details-lastName").fill(A.lastName);
    await page.locator('input[autocomplete="tel"]').fill("0611223344");
    await page.locator('input[type="email"]').fill(A.email.toUpperCase());
    await page.getByText("Adresse", { exact: true }).click();
    await page.waitForTimeout(300);
    await page.locator("#booking-details-address").fill("1 rue de l’Archive");
    await page.locator("#booking-details-postalCode").fill("76000");
    await page.locator("#booking-details-city").fill("Rouen");
    await page.getByText("Votre animal", { exact: true }).click();
    await page.waitForTimeout(300);
    await page.locator("#booking-details-animalName").fill("ArchiRex");
    await page.locator("#booking-details-reason").fill("Retour après une longue absence.");
    await page.getByRole("button", { name: "Continuer" }).click();
    await page.waitForTimeout(600);
    await page.locator('input[type="checkbox"]').check();
    await page.getByRole("button", { name: "Réserver mon rendez-vous" }).click();
    await expect(page.getByRole("heading", { name: /Demande envoyée à/ })).toBeVisible({ timeout: 15000 });
  } finally {
    await visitor.close();
  }

  const [client] = await sql`SELECT "archivedAt" FROM "Client" WHERE id = ${A.id}`;
  expect(client.archivedAt, "désarchivé par sa réservation").toBeNull();
  const [audit] = await sql`SELECT metadata FROM "AuditLog" WHERE "entityId" = ${A.id} AND action = 'CLIENT_RESTORED' ORDER BY "createdAt" DESC LIMIT 1`;
  expect(audit.metadata).toEqual({ source: "public_booking" });
  const [count] = await sql`SELECT count(*)::int AS n FROM "Client" WHERE lower(email) = ${A.email}`;
  expect(count.n, "la même fiche, pas un doublon").toBe(1);
});
