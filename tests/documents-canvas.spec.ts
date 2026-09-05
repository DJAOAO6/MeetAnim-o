import { config } from "dotenv";
import { expect, test } from "@playwright/test";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.local" });

/**
 * Studio de documents, étape 2 : moteur canvas (Konva + Tiptap hybride).
 */

const testEmail = "praticien-test@pf-osteo-animale.fr";
const testPassword = "Praticien-Test-2026!";
const testTitle = "E2ECanvasTest";

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
  await page.waitForTimeout(800);
}

test.describe("Documents — moteur canvas (étape 2)", () => {
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

  test("ajouter un texte, taper dedans, et l'autosave persiste réellement le contenu", async ({ page }) => {
    const sql = neon(process.env.DATABASE_URL!);
    const title = `${testTitle} Texte`;
    await createAndOpenDocument(page, title);

    await page.getByRole("button", { name: "Texte" }).click();
    await page.waitForTimeout(300);
    await page.keyboard.type("Observation clinique");
    await page.keyboard.press("Tab");

    await expect(page.getByText("✓ Enregistré")).toBeVisible({ timeout: 5000 });

    const [row] = await sql`SELECT "contentJson" FROM "StudioDocument" WHERE title = ${title}`;
    const content = row.contentJson as { pages: { elements: { type: string; html?: string }[] }[] };
    const textElement = content.pages[0].elements.find((element) => element.type === "text");
    expect(textElement?.html).toContain("Observation clinique");
  });

  test("ajouter une forme, la déplacer, et retrouver sa nouvelle position en base", async ({ page }) => {
    const sql = neon(process.env.DATABASE_URL!);
    const title = `${testTitle} Forme`;
    await createAndOpenDocument(page, title);

    await page.getByRole("button", { name: "Rectangle" }).click();
    await page.waitForTimeout(300);

    // La forme est sélectionnée à la création — modifie sa position via le
    // panneau de propriétés plutôt qu'un glisser-déposer, plus fiable en E2E.
    const xField = page.getByLabel("Position X");
    await xField.fill("200");
    await xField.press("Tab");
    await page.waitForTimeout(2500);

    const [row] = await sql`SELECT "contentJson" FROM "StudioDocument" WHERE title = ${title}`;
    const content = row.contentJson as { pages: { elements: { type: string; x: number }[] }[] };
    const shape = content.pages[0].elements.find((element) => element.type === "shape");
    expect(shape?.x).toBe(200);
  });

  test("dupliquer puis supprimer un élément fonctionne réellement", async ({ page }) => {
    const sql = neon(process.env.DATABASE_URL!);
    const title = `${testTitle} DupSuppr`;
    await createAndOpenDocument(page, title);

    await page.getByRole("button", { name: "Cercle" }).click();
    await page.waitForTimeout(300);
    await page.getByRole("button", { name: "Dupliquer" }).click();
    await page.waitForTimeout(2500);

    const [afterDuplicate] = await sql`SELECT "contentJson" FROM "StudioDocument" WHERE title = ${title}`;
    const contentAfterDuplicate = afterDuplicate.contentJson as { pages: { elements: unknown[] }[] };
    expect(contentAfterDuplicate.pages[0].elements.length).toBe(2);

    await page.getByRole("button", { name: "Supprimer" }).click();
    await page.waitForTimeout(2500);

    const [afterDelete] = await sql`SELECT "contentJson" FROM "StudioDocument" WHERE title = ${title}`;
    const contentAfterDelete = afterDelete.contentJson as { pages: { elements: unknown[] }[] };
    expect(contentAfterDelete.pages[0].elements.length).toBe(1);
  });

  test("un document finalisé (simulé) n'accepte plus la moindre modification", async ({ page }) => {
    const sql = neon(process.env.DATABASE_URL!);
    const title = `${testTitle} Finalise`;
    await createAndOpenDocument(page, title);
    await sql`UPDATE "StudioDocument" SET status = 'FINALIZED' WHERE title = ${title}`;

    await page.reload();
    await page.waitForTimeout(600);

    await expect(page.getByText("FINALISÉ")).toBeVisible();
    await expect(page.getByRole("button", { name: "Texte" })).toBeDisabled();
    await expect(page.getByLabel("Titre du document")).toBeDisabled();
  });
});
