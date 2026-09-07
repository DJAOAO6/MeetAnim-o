import { config } from "dotenv";
import { expect, test } from "@playwright/test";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.local" });

/**
 * Studio de documents, étape 23 : bibliothèque d'icônes cherchable. Premier
 * nouveau type d'élément (DocumentIconElement) depuis les 4 fondateurs de
 * l'étape 1 — viewBox 0-24 déjà en coordonnées haut-gauche, donc x/y ne
 * nécessite aucun offsetX/Y contrairement au correctif des formes centrées
 * de l'étape 19 (Circle/Ellipse/Triangle/Hexagone/Étoile).
 */

const testEmail = "praticien-test@pf-osteo-animale.fr";
const testPassword = "Praticien-Test-2026!";
const testTitle = "E2EIconsTest";
const DEFAULT_X = 60;
const DEFAULT_Y = 60;

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
  const content = row.contentJson as { pages: { elements: { type: string; iconName?: string; x: number; y: number; color?: string }[] }[] };
  return content.pages[0].elements;
}

test.describe("Documents — bibliothèque d'icônes (étape 23)", () => {
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

  test("insérer une icône persiste type:\"icon\", le bon iconName et x/y sans dérive de coordonnées", async ({ page }) => {
    const title = `${testTitle} Insert`;
    await createAndOpenDocument(page, title);

    await page.getByRole("button", { name: "Icônes" }).click();
    await page.getByRole("button", { name: "Cœur", exact: true }).click();
    await page.waitForTimeout(2500);

    const elements = await readElements(title);
    expect(elements).toHaveLength(1);
    expect(elements[0].type).toBe("icon");
    expect(elements[0].iconName).toBe("Cœur");
    expect(elements[0].x).toBe(DEFAULT_X);
    expect(elements[0].y).toBe(DEFAULT_Y);
  });

  test("changer la couleur d'une icône via le ColorPicker persiste color", async ({ page }) => {
    const title = `${testTitle} Color`;
    await createAndOpenDocument(page, title);

    await page.getByRole("button", { name: "Icônes" }).click();
    await page.getByRole("button", { name: "Cabinet", exact: true }).click();
    await page.waitForTimeout(300);
    await page.getByRole("button", { name: "Icônes" }).click();

    await page.getByRole("button", { name: "Couleur de l'icône" }).click();
    const hexInput = page.getByRole("dialog", { name: "Couleur de l'icône" }).getByRole("textbox");
    await hexInput.fill("#7a5aa8");
    await hexInput.press("Enter");
    await page.waitForTimeout(2500);

    const elements = await readElements(title);
    expect(elements[0].color).toBe("#7a5aa8");
  });

  test("la recherche filtre bien la liste des icônes", async ({ page }) => {
    const title = `${testTitle} Search`;
    await createAndOpenDocument(page, title);

    await page.getByRole("button", { name: "Icônes" }).click();
    await expect(page.getByRole("button", { name: "Thermomètre", exact: true })).toBeVisible();
    await page.getByRole("searchbox").fill("cal");
    await expect(page.getByRole("button", { name: "Calendrier", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Thermomètre", exact: true })).toHaveCount(0);
  });

  test("une icône insérée apparaît avec son nom dans le panneau Calques", async ({ page }) => {
    const title = `${testTitle} Layers`;
    await createAndOpenDocument(page, title);

    await page.getByRole("button", { name: "Icônes" }).click();
    await page.getByRole("button", { name: "Alerte", exact: true }).click();
    await page.waitForTimeout(300);
    await page.getByRole("button", { name: "Icônes" }).click();

    await page.getByRole("tab", { name: "Calques" }).click();
    await expect(page.getByRole("button", { name: "Alerte", exact: true })).toBeVisible();
  });

  test("une sélection par glisser couvrant une icône la sélectionne", async ({ page }) => {
    const title = `${testTitle} Marquee`;
    await createAndOpenDocument(page, title);

    await page.getByRole("button", { name: "Icônes" }).click();
    await page.getByRole("button", { name: "Dossier", exact: true }).click();
    await page.waitForTimeout(300);
    await page.getByRole("button", { name: "Icônes" }).click();

    const canvasBox = await page.locator("canvas").first().boundingBox();
    if (!canvasBox) throw new Error("Canvas introuvable");
    // Désélectionne d'abord (l'insertion sélectionne déjà l'icône, dont la
    // poignée du Transformer se trouve pile à son coin haut-gauche).
    await page.mouse.click(canvasBox.x + 400, canvasBox.y + 400);
    await page.waitForTimeout(200);
    await page.mouse.move(canvasBox.x + 20, canvasBox.y + 20);
    await page.mouse.down();
    await page.mouse.move(canvasBox.x + 130, canvasBox.y + 130, { steps: 10 });
    await page.mouse.up();

    await expect(page.getByLabel("Position X")).toHaveValue(String(DEFAULT_X));
    await expect(page.getByLabel("Position Y")).toHaveValue(String(DEFAULT_Y));
  });

  test("la bibliothèque élargie (étape 24) expose la catégorie « Documents » et les espèces animales", async ({ page }) => {
    const title = `${testTitle} Elargie`;
    await createAndOpenDocument(page, title);

    await page.getByRole("button", { name: "Icônes" }).click();
    await expect(page.getByRole("button", { name: "Chien", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Chat", exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Fichier", exact: true }).click();
    await page.waitForTimeout(2500);

    const elements = await readElements(title);
    expect(elements).toHaveLength(1);
    expect(elements[0].type).toBe("icon");
    expect(elements[0].iconName).toBe("Fichier");
  });
});
