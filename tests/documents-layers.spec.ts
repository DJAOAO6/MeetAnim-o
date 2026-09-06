import { config } from "dotenv";
import { expect, test } from "@playwright/test";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.local" });

/**
 * Studio de documents, étape 11 : onglets Propriétés/Calques, vrai panneau
 * Calques (afficher/masquer, monter/descendre), épaisseur de contour et
 * rayon d'angle pour les formes.
 */

const testEmail = "praticien-test@pf-osteo-animale.fr";
const testPassword = "Praticien-Test-2026!";
const testTitle = "E2ELayersTest";

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

// Ferme le panneau "Formes" une fois l'insertion faite : son bouton
// "Rectangle" collide sinon avec le libellé du calque du même nom dans le
// panneau Calques (à droite), les deux étant des régions indépendantes.
async function insertShapeAndClosePanel(page: import("@playwright/test").Page, shapeLabel: string) {
  await page.getByRole("button", { name: "Formes" }).click();
  await page.getByRole("button", { name: shapeLabel, exact: true }).click();
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: "Formes" }).click();
}

async function readContent(title: string) {
  const sql = neon(process.env.DATABASE_URL!);
  const [row] = await sql`SELECT "contentJson" FROM "StudioDocument" WHERE title = ${title}`;
  return row.contentJson as { pages: { elements: { type: string; shape?: string; hidden?: boolean; strokeWidth?: number; cornerRadius?: number }[] }[] };
}

test.describe("Documents — inspecteur à onglets et Calques (étape 11)", () => {
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

  test("masquer un élément depuis Calques le retire du rendu et persiste hidden:true", async ({ page }) => {
    const title = `${testTitle} Hide`;
    await createAndOpenDocument(page, title);
    await insertShapeAndClosePanel(page, "Rectangle");

    await page.getByRole("tab", { name: "Calques" }).click();
    await page.getByRole("button", { name: /^Masquer Rectangle$/ }).click();
    await page.waitForTimeout(2500);

    const content = await readContent(title);
    expect(content.pages[0].elements[0].hidden).toBe(true);
    await expect(page.getByRole("button", { name: /^Afficher Rectangle$/ })).toBeVisible();
  });

  test("monter/descendre un calque change l'ordre de rendu en base", async ({ page }) => {
    const title = `${testTitle} Reorder`;
    await createAndOpenDocument(page, title);
    await insertShapeAndClosePanel(page, "Rectangle");
    await insertShapeAndClosePanel(page, "Cercle");
    // Ordre tableau actuel : [Rectangle, Cercle] (Cercle au premier plan,
    // affiché en tête dans Calques puisque la liste y est inversée).

    await page.getByRole("tab", { name: "Calques" }).click();
    await page.getByRole("button", { name: "Descendre Cercle dans l'ordre d'affichage" }).click();
    await page.waitForTimeout(2500);

    const content = await readContent(title);
    expect(content.pages[0].elements[0].shape).toBe("circle");
    expect(content.pages[0].elements[1].shape).toBe("rect");
  });

  test("sélectionner un élément masqué depuis Calques affiche ses propriétés", async ({ page }) => {
    const title = `${testTitle} SelectHidden`;
    await createAndOpenDocument(page, title);
    await insertShapeAndClosePanel(page, "Rectangle");

    await page.getByRole("tab", { name: "Calques" }).click();
    await page.getByRole("button", { name: /^Masquer Rectangle$/ }).click();
    await page.waitForTimeout(300);

    await page.getByRole("button", { name: "Rectangle", exact: true }).click();
    await page.getByRole("tab", { name: "Propriétés" }).click();
    await expect(page.getByLabel("Position X")).toHaveValue("60");
  });

  test("épaisseur de contour et rayon d'angle persistent et se reflètent sur la forme", async ({ page }) => {
    const title = `${testTitle} Style`;
    await createAndOpenDocument(page, title);
    await insertShapeAndClosePanel(page, "Rectangle");

    const strokeWidthField = page.getByLabel("Épaisseur de contour");
    await strokeWidthField.fill("6");
    await strokeWidthField.press("Tab");
    const cornerRadiusField = page.getByLabel("Rayon d'angle");
    await cornerRadiusField.fill("20");
    await cornerRadiusField.press("Tab");
    await page.waitForTimeout(2500);

    const content = await readContent(title);
    expect(content.pages[0].elements[0].strokeWidth).toBe(6);
    expect(content.pages[0].elements[0].cornerRadius).toBe(20);
  });
});
