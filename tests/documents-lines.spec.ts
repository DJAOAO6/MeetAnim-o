import { config } from "dotenv";
import { expect, test } from "@playwright/test";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.local" });

/**
 * Studio de documents, étape 20 : catégorie "Lignes" séparée de "Formes"
 * (Ligne y a déménagé), Flèche/Flèche double/Chevron, bascule Pointillé.
 */

const testEmail = "praticien-test@pf-osteo-animale.fr";
const testPassword = "Praticien-Test-2026!";
const testTitle = "E2ELinesTest";

async function cleanupDocuments() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`DELETE FROM "StudioDocument" WHERE title LIKE ${testTitle + "%"}`;
}

async function clearLoginRateLimit() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`DELETE FROM "RateLimitEvent" WHERE key LIKE 'login:%'`;
}

async function createAndOpenDocument(page: import("@playwright/test").Page, title: string) {
  await page.goto("/dashboard/documents");
  await page.getByRole("button", { name: "Nouveau document" }).click();
  await page.getByPlaceholder("Ex. Compte rendu — Oslo").fill(title);
  await page.getByRole("dialog").getByRole("button", { name: "Créer" }).click();
  await page.waitForURL(/\/dashboard\/documents\/[a-z0-9]+/, { timeout: 10000 });
  await page.waitForTimeout(700);
}

async function readElements(title: string) {
  const sql = neon(process.env.DATABASE_URL!);
  const [row] = await sql`SELECT "contentJson" FROM "StudioDocument" WHERE title = ${title}`;
  const content = row.contentJson as { pages: { elements: { shape?: string; dashed?: boolean; doubleArrow?: boolean }[] }[] };
  return content.pages[0].elements;
}

test.describe("Documents — catégorie Lignes & flèches (étape 20)", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async ({ page }) => {
    await cleanupDocuments();
    await clearLoginRateLimit();
    await page.goto("/login");
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', testPassword);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard**", { timeout: 10000 });
  });

  test.afterEach(async () => {
    await cleanupDocuments();
  });

  test("le rail affiche « Lignes » comme catégorie séparée de « Formes », sans Ligne dans Formes", async ({ page }) => {
    const title = `${testTitle} RailCategory`;
    await createAndOpenDocument(page, title);

    await page.getByRole("button", { name: "Formes" }).click();
    await expect(page.getByRole("button", { name: "Ligne", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Formes" }).click();

    await page.getByRole("button", { name: "Lignes" }).click();
    await expect(page.getByRole("button", { name: "Ligne", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Flèche", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Flèche double" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Chevron" })).toBeVisible();
  });

  test("insérer une flèche puis basculer « Double flèche » persiste doubleArrow:true", async ({ page }) => {
    const title = `${testTitle} DoubleArrow`;
    await createAndOpenDocument(page, title);

    await page.getByRole("button", { name: "Lignes" }).click();
    await page.getByRole("button", { name: "Flèche", exact: true }).click();
    await page.waitForTimeout(300);
    await page.getByRole("button", { name: "Lignes" }).click();

    await page.getByRole("checkbox", { name: "Double flèche" }).check();
    await page.waitForTimeout(2500);

    const elements = await readElements(title);
    expect(elements[0].shape).toBe("arrow");
    expect(elements[0].doubleArrow).toBe(true);
  });

  test("basculer « Pointillé » sur une ligne persiste dashed:true", async ({ page }) => {
    const title = `${testTitle} Dashed`;
    await createAndOpenDocument(page, title);

    await page.getByRole("button", { name: "Lignes" }).click();
    await page.getByRole("button", { name: "Ligne", exact: true }).click();
    await page.waitForTimeout(300);
    await page.getByRole("button", { name: "Lignes" }).click();

    await page.getByRole("checkbox", { name: "Pointillé" }).check();
    await page.waitForTimeout(2500);

    const elements = await readElements(title);
    expect(elements[0].shape).toBe("line");
    expect(elements[0].dashed).toBe(true);
  });

  test("insérer un chevron persiste bien shape:\"chevron\"", async ({ page }) => {
    const title = `${testTitle} Chevron`;
    await createAndOpenDocument(page, title);

    await page.getByRole("button", { name: "Lignes" }).click();
    await page.getByRole("button", { name: "Chevron" }).click();
    await page.waitForTimeout(2500);

    const elements = await readElements(title);
    expect(elements[0].shape).toBe("chevron");
  });
});
