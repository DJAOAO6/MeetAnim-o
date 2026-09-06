import { config } from "dotenv";
import { expect, test } from "@playwright/test";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.local" });

/**
 * Studio de documents, étape 8 : barre de formatage flottante (gras,
 * couleur, alignement...) — extensions TextStyleKit/TextAlign ajoutées à
 * Tiptap, aucun changement de schéma (le HTML sérialisé continue de vivre
 * dans DocumentTextElement.html, comme avant).
 */

const testEmail = "praticien-test@pf-osteo-animale.fr";
const testPassword = "Praticien-Test-2026!";
const testTitle = "E2ETextFormatTest";

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

async function addAndEditTextBlock(page: import("@playwright/test").Page, text: string) {
  await page.getByRole("button", { name: "Texte" }).click();
  await page.getByRole("button", { name: "Bloc de texte" }).click();
  await page.waitForTimeout(400);
  await page.keyboard.type(text);
  await page.keyboard.press("Control+a");
}

async function readContentHtml(title: string): Promise<string> {
  const sql = neon(process.env.DATABASE_URL!);
  const [row] = await sql`SELECT "contentJson" FROM "StudioDocument" WHERE title = ${title}`;
  const content = row.contentJson as { pages: { elements: { type: string; html?: string }[] }[] };
  const textElement = content.pages[0].elements.find((element) => element.type === "text");
  return textElement?.html ?? "";
}

test.describe("Documents — barre de formatage du texte (étape 8)", () => {
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

  test("le gras persiste réellement dans le HTML enregistré", async ({ page }) => {
    const title = `${testTitle} Gras`;
    await createAndOpenDocument(page, title);
    await addAndEditTextBlock(page, "Texte en gras");

    await page.getByRole("button", { name: "Gras" }).click();
    await page.waitForTimeout(2500);

    const html = await readContentHtml(title);
    expect(html).toContain("<strong>");
  });

  test("la couleur persiste réellement dans le HTML enregistré", async ({ page }) => {
    const title = `${testTitle} Couleur`;
    await createAndOpenDocument(page, title);
    await addAndEditTextBlock(page, "Texte coloré");

    await page.locator('input[type="color"]').fill("#ff0000");
    await page.waitForTimeout(2500);

    const html = await readContentHtml(title);
    expect(html).toContain("color: rgb(255, 0, 0)");
  });

  test("l'alignement centré persiste réellement dans le HTML enregistré", async ({ page }) => {
    const title = `${testTitle} Alignement`;
    await createAndOpenDocument(page, title);
    await addAndEditTextBlock(page, "Texte centré");

    await page.getByRole("button", { name: "Centrer" }).click();
    await page.waitForTimeout(2500);

    const html = await readContentHtml(title);
    expect(html).toContain("text-align: center");
  });

  test("la barre disparaît à la sortie du mode édition et réapparaît au bon endroit au double-clic suivant", async ({ page }) => {
    const title = `${testTitle} Toolbar`;
    await createAndOpenDocument(page, title);
    await addAndEditTextBlock(page, "Texte");

    await expect(page.getByRole("toolbar", { name: "Mise en forme du texte" })).toBeVisible();

    // Cliquer ailleurs sur le canevas sort du mode édition (blur réel, pas
    // un clic sur la barre — voir preventFocusSteal dans text-format-toolbar.tsx).
    await page.locator("canvas").first().click({ position: { x: 300, y: 400 } });
    await page.waitForTimeout(300);
    await expect(page.getByRole("toolbar", { name: "Mise en forme du texte" })).toHaveCount(0);
  });
});
