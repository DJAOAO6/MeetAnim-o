import { config } from "dotenv";
import { expect, test } from "@playwright/test";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.local" });

/**
 * Studio de documents, étape 4 : schéma animalier (chien) + repères.
 */

const testEmail = "praticien-test@pf-osteo-animale.fr";
const testPassword = "Praticien-Test-2026!";
const testTitle = "E2EDiagramTest";

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
  await page.waitForTimeout(600);
}

test.describe("Documents — schéma animalier et repères (étape 4)", () => {
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

  test("poser un repère sur le schéma persiste sa position, son préréglage et son libellé", async ({ page }) => {
    const sql = neon(process.env.DATABASE_URL!);
    const title = `${testTitle} Pose`;
    await createAndOpenDocument(page, title);

    await page.getByRole("button", { name: "Schéma (chien)" }).click();
    await page.waitForTimeout(300);

    await page.getByRole("button", { name: "Restriction" }).click();
    await expect(page.getByText("Cliquez sur le schéma pour poser le repère…")).toBeVisible();

    const canvas = page.locator("canvas").first();
    const box = await canvas.boundingBox();
    if (!box) throw new Error("canvas introuvable");
    await page.mouse.click(box.x + 80, box.y + 140);
    await page.waitForTimeout(2500);

    const [row] = await sql`SELECT "contentJson" FROM "StudioDocument" WHERE title = ${title}`;
    const content = row.contentJson as { pages: { elements: { type: string; markers?: { presetId: string; label: string; x: number; y: number }[] }[] }[] };
    const diagram = content.pages[0].elements.find((element) => element.type === "diagram");
    expect(diagram?.markers?.length).toBe(1);
    expect(diagram?.markers?.[0].presetId).toBe("restriction");
    expect(diagram?.markers?.[0].label).toBe("Restriction");
    expect(diagram?.markers?.[0].x).toBeGreaterThan(0);
    expect(diagram?.markers?.[0].y).toBeGreaterThan(0);

    await expect(page.getByText("1. Restriction")).toBeVisible();
  });

  test("supprimer un repère depuis le panneau le retire réellement du document", async ({ page }) => {
    const sql = neon(process.env.DATABASE_URL!);
    const title = `${testTitle} Suppr`;
    await createAndOpenDocument(page, title);

    await page.getByRole("button", { name: "Schéma (chien)" }).click();
    await page.waitForTimeout(300);
    await page.getByRole("button", { name: "Tension" }).click();
    const canvas = page.locator("canvas").first();
    const box = await canvas.boundingBox();
    if (!box) throw new Error("canvas introuvable");
    await page.mouse.click(box.x + 100, box.y + 150);
    await page.waitForTimeout(2500);

    await page.getByRole("button", { name: "Supprimer le repère 1" }).click();
    await page.waitForTimeout(2500);

    const [row] = await sql`SELECT "contentJson" FROM "StudioDocument" WHERE title = ${title}`;
    const content = row.contentJson as { pages: { elements: { type: string; markers?: unknown[] }[] }[] };
    const diagram = content.pages[0].elements.find((element) => element.type === "diagram");
    expect(diagram?.markers?.length).toBe(0);
  });

  test("masquer la légende persiste showLegend à false", async ({ page }) => {
    const sql = neon(process.env.DATABASE_URL!);
    const title = `${testTitle} Legende`;
    await createAndOpenDocument(page, title);

    await page.getByRole("button", { name: "Schéma (chien)" }).click();
    await page.waitForTimeout(300);

    await page.getByLabel("Afficher la légende").uncheck();
    await page.waitForTimeout(2500);

    const [row] = await sql`SELECT "contentJson" FROM "StudioDocument" WHERE title = ${title}`;
    const content = row.contentJson as { pages: { elements: { type: string; showLegend?: boolean }[] }[] };
    const diagram = content.pages[0].elements.find((element) => element.type === "diagram");
    expect(diagram?.showLegend).toBe(false);
  });

  test("renommer un préréglage de repère persiste et se reflète immédiatement dans le sélecteur", async ({ page }) => {
    const sql = neon(process.env.DATABASE_URL!);
    const title = `${testTitle} Renomme`;
    await createAndOpenDocument(page, title);

    await page.getByRole("button", { name: "Schéma (chien)" }).click();
    await page.waitForTimeout(300);

    const renameInput = page.getByLabel("Renommer le repère À surveiller");
    await renameInput.fill("Vigilance renforcée");
    await renameInput.press("Tab");
    await page.waitForTimeout(600);

    await expect(page.getByRole("button", { name: "Vigilance renforcée" })).toBeVisible();

    const [profile] = await sql`SELECT "markerPresets" FROM "BusinessProfile" LIMIT 1`;
    const presets = profile.markerPresets as { id: string; label: string }[];
    expect(presets.find((preset) => preset.id === "a-surveiller")?.label).toBe("Vigilance renforcée");

    // Restaure le libellé par défaut pour ne pas polluer les tests suivants
    // (ce préréglage est partagé par tout le cabinet, pas propre à ce test).
    const restoreInput = page.getByLabel("Renommer le repère Vigilance renforcée");
    await restoreInput.fill("À surveiller");
    await restoreInput.press("Tab");
    await page.waitForTimeout(600);
  });
});
