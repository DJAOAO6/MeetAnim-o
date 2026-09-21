import { config } from "dotenv";
import { expect, test } from "@playwright/test";
import { neon } from "./helpers/sql";

config({ path: ".env.local" });

/**
 * Studio de documents, étape 14 : barre d'alignement/distribution flottante,
 * visible uniquement quand la sélection contient au moins 2 éléments (voir
 * alignment-toolbar.tsx). S'appuie sur la sélection multiple de l'étape 13.
 */

const testEmail = "praticien-test@pf-osteo-animale.fr";
const testPassword = "Praticien-Test-2026!";
const testTitle = "E2EAlignmentTest";

async function cleanupDocuments() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`DELETE FROM "StudioDocument" WHERE title LIKE ${testTitle + "%"}`;
}

async function clearLoginRateLimit() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`DELETE FROM "RateLimitEvent" WHERE key LIKE 'login:%'`;
}

async function readElements(title: string) {
  const sql = neon(process.env.DATABASE_URL!);
  const [row] = await sql`SELECT "contentJson" FROM "StudioDocument" WHERE title = ${title}`;
  const content = row.contentJson as { pages: { elements: { id: string; x: number; y: number; width: number }[] }[] };
  return content.pages[0].elements;
}

async function createDocumentWithRectangles(page: import("@playwright/test").Page, title: string, positions: { x: number; y: number }[]) {
  await page.goto("/dashboard/documents");
  await page.getByRole("button", { name: "Nouveau document" }).click();
  await page.getByPlaceholder("Ex. Compte rendu — Oslo").fill(title);
  await page.getByRole("dialog").getByRole("button", { name: "Créer" }).click();
  await page.waitForURL(/\/dashboard\/documents\/[a-z0-9]+/, { timeout: 10000 });
  await page.waitForTimeout(700);
  // Le zoom s'ajuste désormais à l'ouverture pour que la page entière
  // tienne à l'écran : ce test raisonne en coordonnées document
  // (canvasBox.x + 60 = x:60 de la page), il lui faut donc l'échelle 1:1.
  await page.getByRole("button", { name: "Réinitialiser le zoom à 100 %" }).click();
  await page.waitForTimeout(200);

  await page.getByRole("button", { name: "Formes" }).click();
  for (const position of positions) {
    await page.getByRole("button", { name: "Rectangle", exact: true }).click();
    await page.waitForTimeout(250);
    const xField = page.getByLabel("Position X");
    await xField.fill(String(position.x));
    await xField.press("Tab");
    const yField = page.getByLabel("Position Y");
    await yField.fill(String(position.y));
    await yField.press("Tab");
    await page.waitForTimeout(250);
  }
  await page.getByRole("button", { name: "Formes" }).click();

  const canvasBox = await page.locator("canvas").first().boundingBox();
  if (!canvasBox) throw new Error("Canvas introuvable");
  return canvasBox;
}

async function selectAllByMarquee(page: import("@playwright/test").Page, canvasBox: { x: number; y: number }) {
  await page.mouse.move(canvasBox.x, canvasBox.y);
  await page.mouse.down();
  await page.mouse.move(canvasBox.x + 780, canvasBox.y + 500, { steps: 10 });
  await page.mouse.up();
  await expect(page.getByRole("toolbar", { name: "Alignement et distribution" })).toBeVisible();
}

test.describe("Documents — alignement et distribution (étape 14)", () => {
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

  test("aligner 3 formes à gauche persiste le même x pour les 3, et un seul Ctrl+Z annule toute l'opération", async ({ page }) => {
    const title = `${testTitle} AlignLeft`;
    const canvasBox = await createDocumentWithRectangles(page, title, [
      { x: 60, y: 60 },
      { x: 300, y: 220 },
      { x: 550, y: 380 },
    ]);
    await page.waitForTimeout(2500);
    const before = await readElements(title);
    expect(before.map((element) => element.x).sort((a, b) => a - b)).toEqual([60, 300, 550]);

    await selectAllByMarquee(page, canvasBox);
    await page.getByRole("button", { name: "Aligner à gauche" }).click();
    await page.waitForTimeout(2500);

    const aligned = await readElements(title);
    expect(aligned.every((element) => element.x === 60)).toBe(true);

    await page.keyboard.press("Control+z");
    await page.waitForTimeout(2500);
    const reverted = await readElements(title);
    expect(reverted.map((element) => element.x).sort((a, b) => a - b)).toEqual([60, 300, 550]);
  });

  test("distribuer horizontalement 3 formes produit un espacement égal mesurable", async ({ page }) => {
    const title = `${testTitle} Distribute`;
    // Espacement volontairement inégal au départ (60 -> 250 -> 700).
    const canvasBox = await createDocumentWithRectangles(page, title, [
      { x: 60, y: 60 },
      { x: 250, y: 60 },
      { x: 700, y: 60 },
    ]);

    await selectAllByMarquee(page, canvasBox);
    await page.getByRole("button", { name: "Distribuer horizontalement" }).click();
    await page.waitForTimeout(2500);

    const distributed = await readElements(title);
    const sorted = [...distributed].sort((a, b) => a.x - b.x);
    // Les extrêmes ne bougent pas ; l'espacement gauche-à-gauche devient égal
    // (rectangles de largeur identique ici, donc gap constant = même delta).
    expect(sorted[0].x).toBe(60);
    expect(sorted[2].x).toBe(700);
    const gapA = sorted[1].x - (sorted[0].x + sorted[0].width);
    const gapB = sorted[2].x - (sorted[1].x + sorted[1].width);
    expect(Math.abs(gapA - gapB)).toBeLessThan(0.01);
  });
});
