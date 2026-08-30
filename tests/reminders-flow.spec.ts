import { config } from "dotenv";
import { expect, test } from "@playwright/test";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.local" });

/**
 * FIX_PLAN.md P2-23 : l'écran Rappels (création, édition, envoi, ignorer)
 * était une simulation 100% locale (useState, aucune écriture en base).
 * Vérifie que chaque action passe désormais réellement par
 * reminders-actions.ts et persiste en base.
 */

const testEmail = "praticien-test@pf-osteo-animale.fr";
const testPassword = "Praticien-Test-2026!";
const testClientId = "tmp-reminders-client";
const testAnimalId = "tmp-reminders-animal";
const testClientLastName = "E2ERemindersTest";

async function seedClientAndAnimal() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`INSERT INTO "Client" (id, "firstName", "lastName", phone, email, city, address, "updatedAt") VALUES (${testClientId}, 'Prénom', ${testClientLastName}, '0600000000', 'reminders-e2e@example.fr', 'Rouen', '1 rue Test', now())`;
  await sql`INSERT INTO "Animal" (id, "clientId", name, species, breed, age, weight, sex, avatar, "avatarBackground", history, conditions, treatments, notes, "updatedAt") VALUES (${testAnimalId}, ${testClientId}, 'RappelE2E', 'Chien', '', '', '', '', '', '', '', '', '', '', now())`;
}

async function cleanupTestData() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`DELETE FROM "Client" WHERE "lastName" = ${testClientLastName}`;
}

async function clearLoginRateLimit() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`DELETE FROM "RateLimitEvent" WHERE key LIKE 'login:%'`;
}

test.describe("Rappels clients (réel, non simulé)", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async ({ page }) => {
    await cleanupTestData();
    await seedClientAndAnimal();
    await clearLoginRateLimit();
    await page.goto("/login");
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', testPassword);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard**", { timeout: 10000 });
  });

  test.afterEach(async () => {
    await cleanupTestData();
  });

  test("programmer un rappel l'écrit réellement en base, avec une antériorité calculée", async ({ page }) => {
    await page.goto("/dashboard/rappels");
    await page.getByRole("button", { name: "+ Programmer un rappel" }).click();
    const dialog = page.locator('section[role="dialog"]');
    await dialog.getByLabel("Client").selectOption({ label: `Prénom ${testClientLastName}` });
    await dialog.getByLabel("Animal").selectOption({ label: "RappelE2E · Chien" });
    const today = new Date().toISOString().slice(0, 10);
    await dialog.getByLabel("Date du rappel").fill(today);
    await dialog.getByLabel("Note facultative").fill("Suivi E2E");
    await dialog.getByRole("button", { name: "Programmer le rappel" }).click();
    await expect(dialog).toHaveCount(0, { timeout: 10000 });

    const sql = neon(process.env.DATABASE_URL!);
    const [reminder] = await sql`SELECT status, note, "lastConsultation", "dueDate" FROM "Reminder" WHERE "animalId" = ${testAnimalId}`;
    expect(reminder).toBeTruthy();
    expect(reminder.status).toBe("DUE");
    expect(reminder.note).toBe("Suivi E2E");
    expect(reminder.lastConsultation).toBeTruthy();

    // La table rend une version bureau (grille) et une version mobile
    // (<article>) simultanément, la CSS ne montrant que l'une des deux
    // selon le viewport (breakpoint lg) — on scope via l'ancêtre commun aux
    // deux structures pour rester correct quel que soit le viewport.
    const visibleCheckbox = page.getByLabel("Sélectionner le rappel de RappelE2E").and(page.locator(":visible"));
    const row = visibleCheckbox.locator("xpath=ancestor::*[self::article or contains(@class,'grid-cols-[38px')][1]");
    await expect(row).toBeVisible();
  });

  test("envoyer un rappel passe réellement par l'action serveur et marque le statut SENT", async ({ page }) => {
    const sql = neon(process.env.DATABASE_URL!);
    const today = new Date().toISOString().slice(0, 10);
    await sql`INSERT INTO "Reminder" (id, "clientId", "animalId", "lastConsultation", delay, "dueDate", status, "updatedAt") VALUES ('tmp-reminder-send', ${testClientId}, ${testAnimalId}, now(), 'SIX_MONTHS', ${today}::date, 'DUE', now())`;

    await page.goto("/dashboard/rappels");
    const visibleCheckbox = page.getByLabel("Sélectionner le rappel de RappelE2E").and(page.locator(":visible"));
    const row = visibleCheckbox.locator("xpath=ancestor::*[self::article or contains(@class,'grid-cols-[38px')][1]");
    await expect(row).toBeVisible();

    await row.getByRole("button", { name: "Relancer" }).click();
    const dialog = page.locator('section[role="dialog"]');
    await expect(dialog.getByText("reminders-e2e@example.fr")).toBeVisible();
    await dialog.getByRole("button", { name: "Envoyer le rappel" }).click();
    await expect(dialog).toHaveCount(0, { timeout: 10000 });

    const [reminder] = await sql`SELECT status FROM "Reminder" WHERE id = 'tmp-reminder-send'`;
    expect(reminder.status).toBe("SENT");

    const [auditLog] = await sql`SELECT action FROM "AuditLog" WHERE "entityId" = 'tmp-reminder-send' AND action = 'REMINDER_SENT'`;
    expect(auditLog).toBeTruthy();
  });

  test("ignorer un rappel le marque IGNORED en base", async ({ page }) => {
    const sql = neon(process.env.DATABASE_URL!);
    const today = new Date().toISOString().slice(0, 10);
    await sql`INSERT INTO "Reminder" (id, "clientId", "animalId", "lastConsultation", delay, "dueDate", status, "updatedAt") VALUES ('tmp-reminder-ignore', ${testClientId}, ${testAnimalId}, now(), 'THREE_MONTHS', ${today}::date, 'DUE', now())`;

    await page.goto("/dashboard/rappels");
    const visibleCheckbox = page.getByLabel("Sélectionner le rappel de RappelE2E").and(page.locator(":visible"));
    const row = visibleCheckbox.locator("xpath=ancestor::*[self::article or contains(@class,'grid-cols-[38px')][1]");
    await expect(row).toBeVisible();

    await row.getByRole("button", { name: "Plus d’actions pour RappelE2E" }).click();
    await row.getByRole("button", { name: "Ignorer" }).click();
    await expect(row.getByText("Ignoré")).toBeVisible({ timeout: 10000 });

    const [reminder] = await sql`SELECT status FROM "Reminder" WHERE id = 'tmp-reminder-ignore'`;
    expect(reminder.status).toBe("IGNORED");
  });
});
