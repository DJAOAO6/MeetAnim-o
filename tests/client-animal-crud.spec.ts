import { config } from "dotenv";
import { expect, test } from "@playwright/test";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.local" });

/**
 * FIX_PLAN.md item 30(c) : parcours CRUD client/animal non couvert par la
 * suite E2E, maintenant que la création/édition réelle existe (P1-7,
 * Sprint 1 — auparavant de simples stubs locaux).
 */

const testEmail = "praticien-test@pf-osteo-animale.fr";
const testPassword = "Praticien-Test-2026!";
const testClientLastName = "E2ECrudTest";
const testClientFirstName = "Prénom";

async function cleanupTestClient() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`DELETE FROM "Client" WHERE "lastName" = ${testClientLastName}`;
}

async function clearLoginRateLimit() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`DELETE FROM "RateLimitEvent" WHERE key LIKE 'login:%'`;
}

test.describe("CRUD client et animal", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async ({ page }) => {
    await clearLoginRateLimit();
    await page.goto("/login");
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', testPassword);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard**", { timeout: 10000 });
  });

  test.afterEach(async () => {
    await cleanupTestClient();
  });

  test("créer un nouveau client depuis la liste l'ajoute réellement en base", async ({ page }) => {
    await page.goto("/dashboard/clients");
    await page.getByRole("button", { name: "Nouveau client" }).click();
    const dialog = page.locator('section[role="dialog"]');
    await dialog.getByLabel("Prénom").fill(testClientFirstName);
    await dialog.getByLabel("Nom", { exact: true }).fill(testClientLastName);
    await dialog.getByLabel("Téléphone").fill("0612345678");
    await dialog.getByLabel("Email").fill("e2e-crud-test@example.fr");
    await dialog.getByRole("button", { name: "Créer le client" }).click();
    await expect(dialog).toHaveCount(0, { timeout: 10000 });

    const sql = neon(process.env.DATABASE_URL!);
    const [client] = await sql`SELECT "firstName", "lastName", email FROM "Client" WHERE "lastName" = ${testClientLastName}`;
    expect(client).toBeTruthy();
    expect(client.email).toBe("e2e-crud-test@example.fr");

    await expect(page.getByText(`${testClientFirstName} ${testClientLastName}`).first()).toBeVisible();
  });

  test("modifier un client existant persiste réellement le changement", async ({ page }) => {
    const sql = neon(process.env.DATABASE_URL!);
    await sql`INSERT INTO "Client" (id, "firstName", "lastName", phone, email, city, address, "updatedAt") VALUES ('tmp-crud-client', ${testClientFirstName}, ${testClientLastName}, '0600000000', 'before-edit@example.fr', 'Rouen', '1 rue Avant', now())`;

    await page.goto("/dashboard/clients/tmp-crud-client");
    await page.waitForTimeout(600);
    await page.getByRole("button", { name: "Modifier" }).first().click();
    const dialog = page.locator('section[role="dialog"]');
    await dialog.getByLabel("Ville").fill("Le Havre");
    await dialog.getByRole("button", { name: "Enregistrer les modifications" }).click();
    await expect(dialog).toHaveCount(0, { timeout: 10000 });

    const [client] = await sql`SELECT city FROM "Client" WHERE id = 'tmp-crud-client'`;
    expect(client.city).toBe("Le Havre");
  });

  test("ajouter un animal à un client existant le persiste réellement", async ({ page }) => {
    const sql = neon(process.env.DATABASE_URL!);
    await sql`INSERT INTO "Client" (id, "firstName", "lastName", phone, email, city, address, "updatedAt") VALUES ('tmp-crud-client2', ${testClientFirstName}, ${testClientLastName}, '0600000000', 'animal-test@example.fr', 'Rouen', '1 rue Test', now())`;

    await page.goto("/dashboard/clients/tmp-crud-client2");
    await page.waitForTimeout(600);
    await page.getByRole("button", { name: "Ajouter un animal" }).first().click();
    const dialog = page.locator('section[role="dialog"]');
    await dialog.getByLabel("Nom", { exact: true }).fill("RexE2E");
    await dialog.getByRole("button", { name: "Ajouter l’animal" }).click();
    await expect(dialog).toHaveCount(0, { timeout: 10000 });

    const [animal] = await sql`SELECT name, species FROM "Animal" WHERE "clientId" = 'tmp-crud-client2'`;
    expect(animal).toBeTruthy();
    expect(animal.name).toBe("RexE2E");
    await expect(page.getByText("RexE2E").first()).toBeVisible();
  });

  test("modifier un animal existant persiste réellement le changement", async ({ page }) => {
    const sql = neon(process.env.DATABASE_URL!);
    await sql`INSERT INTO "Client" (id, "firstName", "lastName", phone, email, city, address, "updatedAt") VALUES ('tmp-crud-client3', ${testClientFirstName}, ${testClientLastName}, '0600000000', 'animal-edit-test@example.fr', 'Rouen', '1 rue Test', now())`;
    await sql`INSERT INTO "Animal" (id, "clientId", name, species, breed, age, weight, sex, avatar, "avatarBackground", history, conditions, treatments, notes, "updatedAt") VALUES ('tmp-crud-animal', 'tmp-crud-client3', 'AvantEdit', 'Chien', '', '', '', '', '', '', '', '', '', '', now())`;

    await page.goto("/dashboard/clients/tmp-crud-client3");
    await page.waitForTimeout(600);
    // Le seul animal du client est présélectionné (AnimalRecord) au chargement
    // — son propre bouton "Modifier" (distinct de celui du client, identique
    // en libellé) est donc le dernier dans l'ordre du DOM sur cette page.
    await page.getByRole("button", { name: "Modifier" }).last().click();
    await page.waitForTimeout(400);
    const dialog = page.locator('section[role="dialog"]');
    await dialog.getByLabel("Nom", { exact: true }).fill("ApresEdit");
    await dialog.getByRole("button", { name: "Enregistrer les modifications" }).click();
    await expect(dialog).toHaveCount(0, { timeout: 10000 });

    const [animal] = await sql`SELECT name FROM "Animal" WHERE id = 'tmp-crud-animal'`;
    expect(animal.name).toBe("ApresEdit");
    await expect(page.getByText("ApresEdit").first()).toBeVisible();
  });
});
