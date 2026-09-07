import { config } from "dotenv";
import { expect, test } from "@playwright/test";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.local" });

/**
 * Studio de documents, étape 15 : repères intelligents (Smart Guides) et
 * snapping magnétique pendant le déplacement d'un élément. La logique de
 * calcul pure est testée séparément (tests-unit/smart-guides.test.ts) — ici
 * on vérifie le vrai pipeline de drag Konva de bout en bout.
 */

const testEmail = "praticien-test@pf-osteo-animale.fr";
const testPassword = "Praticien-Test-2026!";
const testTitle = "E2ESmartGuidesTest";

// Rectangle par défaut (shapes-panel.tsx) : 160×100, inséré à (60,60).
const RECT_WIDTH = 160;
const RECT_HEIGHT = 100;
const PAGE_WIDTH = 794;
const PAGE_HEIGHT = 1123;

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
  const content = row.contentJson as { pages: { elements: { id: string; x: number; y: number }[] }[] };
  return content.pages[0].elements;
}

async function createDocumentWithRectangle(page: import("@playwright/test").Page, title: string) {
  await page.goto("/dashboard/documents");
  await page.getByRole("button", { name: "Nouveau document" }).click();
  await page.getByPlaceholder("Ex. Compte rendu — Oslo").fill(title);
  await page.getByRole("dialog").getByRole("button", { name: "Créer" }).click();
  await page.waitForURL(/\/dashboard\/documents\/[a-z0-9]+/, { timeout: 10000 });
  await page.waitForTimeout(700);

  await page.getByRole("button", { name: "Formes" }).click();
  await page.getByRole("button", { name: "Rectangle", exact: true }).click();
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: "Formes" }).click();

  const canvasBox = await page.locator("canvas").first().boundingBox();
  if (!canvasBox) throw new Error("Canvas introuvable");
  return canvasBox;
}

async function dragBy(page: import("@playwright/test").Page, canvasBox: { x: number; y: number }, from: { x: number; y: number }, to: { x: number; y: number }, holdAlt = false) {
  await page.mouse.move(canvasBox.x + from.x, canvasBox.y + from.y);
  await page.mouse.down();
  if (holdAlt) await page.keyboard.down("Alt");
  await page.mouse.move(canvasBox.x + (from.x + to.x) / 2, canvasBox.y + (from.y + to.y) / 2, { steps: 5 });
  await page.mouse.move(canvasBox.x + to.x, canvasBox.y + to.y, { steps: 10 });
  await page.waitForTimeout(100);
  await page.mouse.up();
  if (holdAlt) await page.keyboard.up("Alt");
}

test.describe("Documents — repères intelligents et snapping (étape 15)", () => {
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

  test("déplacer une forme près du centre de la page la snappe exactement au centre", async ({ page }) => {
    const title = `${testTitle} CenterSnap`;
    const canvasBox = await createDocumentWithRectangle(page, title);
    // Centre du rectangle par défaut (60,60,160,100) = (140,110).
    const rectCenter = { x: 60 + RECT_WIDTH / 2, y: 60 + RECT_HEIGHT / 2 };
    // Cible à 2-3px du centre exact de la page (397, 561.5), sous le seuil de 4px.
    await dragBy(page, canvasBox, rectCenter, { x: PAGE_WIDTH / 2 - 2, y: PAGE_HEIGHT / 2 + 2.5 });
    await page.waitForTimeout(2500);

    const elements = await readElements(title);
    expect(elements[0].x).toBe(PAGE_WIDTH / 2 - RECT_WIDTH / 2);
    expect(elements[0].y).toBe(PAGE_HEIGHT / 2 - RECT_HEIGHT / 2);
  });

  test("déplacer une forme près du bord d'une autre l'aligne exactement sur ce bord", async ({ page }) => {
    const title = `${testTitle} EdgeSnap`;
    const canvasBox = await createDocumentWithRectangle(page, title);

    // Deuxième rectangle, déplacé loin du premier via le panneau Propriétés
    // (plus fiable que le drag pour un positionnement initial exact, voir la
    // convention déjà établie dans documents-canvas.spec.ts).
    await page.getByRole("button", { name: "Formes" }).click();
    await page.getByRole("button", { name: "Rectangle", exact: true }).click();
    await page.waitForTimeout(300);
    const xField = page.getByLabel("Position X");
    await xField.fill("500");
    await xField.press("Tab");
    const yField = page.getByLabel("Position Y");
    await yField.fill("450");
    await yField.press("Tab");
    await page.waitForTimeout(300);
    await page.getByRole("button", { name: "Formes" }).click();

    // Bord droit du premier rectangle : x=60+160=220. On approche le bord
    // gauche du deuxième (grab en son centre) à 2px de cette cible.
    const secondRectCenter = { x: 500 + RECT_WIDTH / 2, y: 450 + RECT_HEIGHT / 2 };
    const targetLeftEdge = 220 + 2; // 2px d'écart, sous le seuil de 4px
    await dragBy(page, canvasBox, secondRectCenter, { x: targetLeftEdge + RECT_WIDTH / 2, y: 450 + RECT_HEIGHT / 2 });
    await page.waitForTimeout(2500);

    const elements = await readElements(title);
    const second = elements.find((element) => element.y !== 60);
    expect(second?.x).toBe(220);
  });

  test("maintenir Alt pendant le drag empêche le snap", async ({ page }) => {
    const title = `${testTitle} AltBypass`;
    const canvasBox = await createDocumentWithRectangle(page, title);
    const rectCenter = { x: 60 + RECT_WIDTH / 2, y: 60 + RECT_HEIGHT / 2 };
    const target = { x: PAGE_WIDTH / 2 - 2, y: PAGE_HEIGHT / 2 + 2.5 };
    await dragBy(page, canvasBox, rectCenter, target, true);
    await page.waitForTimeout(2500);

    const elements = await readElements(title);
    // Sans snap, la position finale est celle du pointeur (centre visé moins
    // la moitié de la taille), PAS la position exactement centrée.
    expect(elements[0].x).not.toBe(PAGE_WIDTH / 2 - RECT_WIDTH / 2);
    expect(elements[0].y).not.toBe(PAGE_HEIGHT / 2 - RECT_HEIGHT / 2);
  });
});
