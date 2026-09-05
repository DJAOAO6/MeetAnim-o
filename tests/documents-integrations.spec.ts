import { config } from "dotenv";
import { expect, test } from "@playwright/test";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.local" });

/**
 * Studio de documents, étape 5 : points d'entrée depuis un rendez-vous
 * terminé (appointment-summary.tsx) et depuis la fiche animal
 * (animal-record.tsx).
 */

const testEmail = "praticien-test@pf-osteo-animale.fr";
const testPassword = "Praticien-Test-2026!";
const testClientLastName = "E2EDocIntegration";

async function cleanup() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`DELETE FROM "StudioDocument" WHERE title LIKE 'Compte rendu%' AND "clientId" IN (SELECT id FROM "Client" WHERE "lastName" = ${testClientLastName})`;
  await sql`DELETE FROM "Appointment" WHERE "clientName" LIKE ${testClientLastName + "%"}`;
  await sql`DELETE FROM "Client" WHERE "lastName" = ${testClientLastName}`;
}

async function clearLoginRateLimit() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`DELETE FROM "RateLimitEvent" WHERE key LIKE 'login:%'`;
}

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.fill('input[type="email"]', testEmail);
  await page.fill('input[type="password"]', testPassword);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard**", { timeout: 10000 });
}

test.describe("Documents — points d'entrée rendez-vous et fiche animal (étape 5)", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async () => {
    await cleanup();
    await clearLoginRateLimit();
  });

  test.afterEach(async () => {
    await cleanup();
  });

  test("« Créer le compte rendu » depuis un rendez-vous terminé lie client, animal et rendez-vous", async ({ page }) => {
    const sql = neon(process.env.DATABASE_URL!);
    const clientName = `${testClientLastName} Rdv`;
    await sql`INSERT INTO "Client" (id, "firstName", "lastName", phone, email, city, address, "updatedAt") VALUES ('tmp-doc-int-client', 'Test', ${testClientLastName}, '0600000000', 'e2e-doc-int@example.fr', 'Rouen', '1 rue Test', now())`;
    await sql`INSERT INTO "Animal" (id, "clientId", name, species, breed, age, weight, sex, avatar, "avatarBackground", history, conditions, treatments, notes, "updatedAt") VALUES ('tmp-doc-int-animal', 'tmp-doc-int-client', ${clientName}, 'Chien', 'Labrador', '3 ans', '25 kg', 'Mâle', '🐕', 'from-amber-100 to-amber-200', '', '', '', '', now())`;
    await sql`
      INSERT INTO "Appointment" (id, "clientId", "animalId", "clientName", "animalName", "animalSpecies", "serviceName", date, start, duration, mode, location, price, status, notes, "createdAt", "updatedAt")
      VALUES ('tmp-doc-int-appt', 'tmp-doc-int-client', 'tmp-doc-int-animal', ${clientName}, ${clientName}, 'Chien', 'Ostéopathie E2E', '2026-10-20'::date, '09:00', 60, 'CABINET', 'Cabinet', 60, 'COMPLETED', '', now(), now())
    `;

    await login(page);
    await page.goto("/dashboard");
    await page.waitForTimeout(600);
    await page.getByRole("button", { name: /Gérer les rendez-vous/ }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByPlaceholder("Rechercher un client, un animal ou une prestation").fill(clientName);
    await dialog.locator("article", { hasText: clientName }).getByRole("button", { name: "Voir la fiche" }).click();

    await dialog.getByRole("button", { name: "Créer le compte rendu" }).click();
    await page.waitForURL(/\/dashboard\/documents\/[a-z0-9]+/, { timeout: 10000 });

    const [row] = await sql`SELECT "clientId", "animalId", "appointmentId", "templateId" FROM "StudioDocument" WHERE "appointmentId" = 'tmp-doc-int-appt'`;
    expect(row).toBeTruthy();
    expect(row.clientId).toBe("tmp-doc-int-client");
    expect(row.animalId).toBe("tmp-doc-int-animal");
    expect(row.templateId).toBeTruthy();

    const [template] = await sql`SELECT species FROM "StudioDocumentTemplate" WHERE id = ${row.templateId}`;
    expect(template.species).toBe("Chien");
  });

  test("« Nouveau compte rendu » depuis la fiche animal crée un document lié à cet animal", async ({ page }) => {
    const sql = neon(process.env.DATABASE_URL!);
    const animalName = `${testClientLastName} Fiche`;
    await sql`INSERT INTO "Client" (id, "firstName", "lastName", phone, email, city, address, "updatedAt") VALUES ('tmp-doc-int-client2', 'Test', ${testClientLastName}, '0600000000', 'e2e-doc-int2@example.fr', 'Rouen', '1 rue Test', now())`;
    await sql`INSERT INTO "Animal" (id, "clientId", name, species, breed, age, weight, sex, avatar, "avatarBackground", history, conditions, treatments, notes, "updatedAt") VALUES ('tmp-doc-int-animal2', 'tmp-doc-int-client2', ${animalName}, 'Chien', 'Labrador', '3 ans', '25 kg', 'Mâle', '🐕', 'from-amber-100 to-amber-200', '', '', '', '', now())`;

    await login(page);
    await page.goto("/dashboard/clients/tmp-doc-int-client2");
    await page.waitForTimeout(800);

    await expect(page.getByText("Comptes rendus")).toBeVisible();
    await expect(page.getByText(`Aucun compte rendu pour ${animalName}.`)).toBeVisible();

    await page.getByRole("button", { name: "Nouveau compte rendu" }).click();
    await page.waitForURL(/\/dashboard\/documents\/[a-z0-9]+/, { timeout: 10000 });

    const [row] = await sql`SELECT "clientId", "animalId", title FROM "StudioDocument" WHERE "animalId" = 'tmp-doc-int-animal2'`;
    expect(row).toBeTruthy();
    expect(row.clientId).toBe("tmp-doc-int-client2");
    expect(row.title).toBe(`Compte rendu — ${animalName}`);
  });
});
