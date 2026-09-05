import { config } from "dotenv";
import { expect, test } from "@playwright/test";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.local" });

/**
 * Studio de documents, étape 1 : squelette (créer/renommer/supprimer un
 * document, sans le canvas — arrive à l'étape 2).
 */

const testEmail = "praticien-test@pf-osteo-animale.fr";
const testPassword = "Praticien-Test-2026!";
const testTitlePrefix = "E2EDocTest";

async function cleanupDocuments() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`DELETE FROM "StudioDocument" WHERE title LIKE ${testTitlePrefix + "%"}`;
}

async function grantManageDocuments() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`UPDATE "User" SET permissions = ARRAY['MANAGE_DOCUMENTS'] WHERE email = ${testEmail}`;
}

async function revokeManageDocuments() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`UPDATE "User" SET permissions = ARRAY[]::text[] WHERE email = ${testEmail}`;
}

async function clearLoginRateLimit() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`DELETE FROM "RateLimitEvent" WHERE key LIKE 'login:%'`;
}

test.describe("Documents — squelette CRUD (étape 1)", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async () => {
    await grantManageDocuments();
  });

  test.afterAll(async () => {
    await revokeManageDocuments();
    await cleanupDocuments();
  });

  test.beforeEach(async ({ page }) => {
    await cleanupDocuments();
    await clearLoginRateLimit();
    await page.goto("/login");
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', testPassword);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard**", { timeout: 10000 });
  });

  test("créer un document l'ajoute réellement en base et ouvre l'éditeur", async ({ page }) => {
    const sql = neon(process.env.DATABASE_URL!);
    const title = `${testTitlePrefix} Création`;

    await page.goto("/dashboard/documents");
    await page.getByRole("button", { name: "Nouveau document" }).click();
    await page.getByPlaceholder("Ex. Compte rendu — Oslo").fill(title);
    await page.getByRole("dialog").getByRole("button", { name: "Créer" }).click();

    await page.waitForURL(/\/dashboard\/documents\/[a-z0-9]+/, { timeout: 10000 });
    await expect(page.getByLabel("Titre du document")).toHaveValue(title);

    const [row] = await sql`SELECT title, status FROM "StudioDocument" WHERE title = ${title}`;
    expect(row).toBeTruthy();
    expect(row.status).toBe("DRAFT");
  });

  test("renommer un document dans l'éditeur persiste réellement le changement", async ({ page }) => {
    const sql = neon(process.env.DATABASE_URL!);
    const title = `${testTitlePrefix} Renommage`;
    const newTitle = `${testTitlePrefix} Renommé`;

    await page.goto("/dashboard/documents");
    await page.getByRole("button", { name: "Nouveau document" }).click();
    await page.getByPlaceholder("Ex. Compte rendu — Oslo").fill(title);
    await page.getByRole("dialog").getByRole("button", { name: "Créer" }).click();
    await page.waitForURL(/\/dashboard\/documents\/[a-z0-9]+/, { timeout: 10000 });

    const titleInput = page.getByLabel("Titre du document");
    await titleInput.fill(newTitle);
    await titleInput.press("Tab");
    await expect(page.getByText("✓ Enregistré")).toBeVisible({ timeout: 5000 });

    const [row] = await sql`SELECT title FROM "StudioDocument" WHERE title = ${newTitle}`;
    expect(row).toBeTruthy();
  });

  test("supprimer un document depuis la liste le retire réellement de la base", async ({ page }) => {
    const sql = neon(process.env.DATABASE_URL!);
    const title = `${testTitlePrefix} Suppression`;
    await sql`INSERT INTO "StudioDocument" (id, title, status, "createdByUserId", "contentJson", "createdAt", "updatedAt") SELECT 'tmp-doc-del-1', ${title}, 'DRAFT', id, '{"formatVersion":1,"pageSize":"A4_PORTRAIT","pages":[]}'::jsonb, now(), now() FROM "User" WHERE email = ${testEmail}`;

    await page.goto("/dashboard/documents");
    await page.waitForTimeout(600);
    await expect(page.getByText(title)).toBeVisible();

    const card = page.getByText(title).locator("xpath=ancestor::*[contains(@class,'rounded-')][1]");
    await card.getByRole("button", { name: "Supprimer" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Supprimer" }).click();

    await expect(page.getByText(title)).toHaveCount(0, { timeout: 5000 });
    const remaining = await sql`SELECT count(*) FROM "StudioDocument" WHERE title = ${title}`;
    expect(Number(remaining[0].count)).toBe(0);
  });
});
