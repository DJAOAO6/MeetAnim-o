import { config } from "dotenv";
import { expect, test } from "@playwright/test";
import { neon } from "./helpers/sql";

config({ path: ".env.local" });

/**
 * Studio de documents, étape 25 : verrouillage d'élément — un élément
 * verrouillé reste visible et sélectionnable (au clic simple) mais ne peut
 * plus être déplacé/redimensionné/dupliqué/supprimé/aligné.
 */

const testEmail = "praticien-test@pf-osteo-animale.fr";
const testPassword = "Praticien-Test-2026!";
const testTitle = "E2ELockingTest";

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
  // Le zoom s'ajuste désormais à l'ouverture pour que la page entière
  // tienne à l'écran : ce test raisonne en coordonnées document
  // (canvasBox.x + 60 = x:60 de la page), il lui faut donc l'échelle 1:1.
  await page.getByRole("button", { name: "Réinitialiser le zoom à 100 %" }).click();
  await page.waitForTimeout(200);
}

async function readElements(title: string) {
  const sql = neon(process.env.DATABASE_URL!);
  const [row] = await sql`SELECT "contentJson" FROM "StudioDocument" WHERE title = ${title}`;
  const content = row.contentJson as { pages: { elements: { id: string; type: string; x: number; y: number; width: number; locked?: boolean }[] }[] };
  return content.pages[0].elements;
}

test.describe("Documents — verrouillage d'élément (étape 25)", () => {
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

  test("verrouiller un élément depuis Calques persiste locked:true et se reflète dans le badge cadenas du canevas", async ({ page }) => {
    const title = `${testTitle} Toggle`;
    await createAndOpenDocument(page, title);

    await page.getByRole("button", { name: "Formes" }).click();
    await page.getByRole("button", { name: "Rectangle", exact: true }).click();
    await page.waitForTimeout(300);
    await page.getByRole("button", { name: "Formes" }).click();

    await page.getByRole("tab", { name: "Calques" }).click();
    await page.getByRole("button", { name: "Verrouiller Rectangle" }).click();
    await page.waitForTimeout(2500);

    let elements = await readElements(title);
    expect(elements[0].locked).toBe(true);
    await expect(page.getByRole("button", { name: "Déverrouiller Rectangle" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Déverrouiller l'élément" })).toBeVisible();

    // Rebascule depuis le badge cadenas du canevas cette fois.
    await page.getByRole("button", { name: "Déverrouiller l'élément" }).click();
    await page.waitForTimeout(2500);
    elements = await readElements(title);
    expect(elements[0].locked).toBeFalsy();
  });

  test("un élément verrouillé ne peut plus être déplacé par glisser", async ({ page }) => {
    const title = `${testTitle} NoDrag`;
    await createAndOpenDocument(page, title);

    await page.getByRole("button", { name: "Formes" }).click();
    await page.getByRole("button", { name: "Rectangle", exact: true }).click();
    await page.waitForTimeout(300);
    await page.getByRole("button", { name: "Formes" }).click();

    await page.getByRole("tab", { name: "Calques" }).click();
    await page.getByRole("button", { name: "Verrouiller Rectangle" }).click();
    await page.waitForTimeout(2500);

    const canvasBox = await page.locator("canvas").first().boundingBox();
    if (!canvasBox) throw new Error("Canvas introuvable");
    // Rectangle par défaut à (60,60), 160x100 — clique dedans, glisse.
    await page.mouse.move(canvasBox.x + 140, canvasBox.y + 110);
    await page.mouse.down();
    await page.mouse.move(canvasBox.x + 300, canvasBox.y + 300, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(1000);

    const elements = await readElements(title);
    expect(elements[0].x).toBe(60);
    expect(elements[0].y).toBe(60);
  });

  test("Suppr sur une sélection mixte (1 verrouillé + 1 non) ne supprime que le non-verrouillé", async ({ page }) => {
    const title = `${testTitle} MixedDelete`;
    await createAndOpenDocument(page, title);

    await page.getByRole("button", { name: "Formes" }).click();
    await page.getByRole("button", { name: "Rectangle", exact: true }).click();
    await page.waitForTimeout(300);
    let xField = page.getByLabel("Position X");
    await xField.fill("60");
    await xField.press("Tab");
    await page.waitForTimeout(300);

    await page.getByRole("button", { name: "Rectangle", exact: true }).click();
    await page.waitForTimeout(300);
    xField = page.getByLabel("Position X");
    await xField.fill("400");
    await xField.press("Tab");
    const yField = page.getByLabel("Position Y");
    await yField.fill("60");
    await yField.press("Tab");
    await page.waitForTimeout(300);
    await page.getByRole("button", { name: "Formes" }).click();

    await page.getByRole("tab", { name: "Calques" }).click();
    await page.getByRole("button", { name: "Verrouiller Rectangle (1)" }).click();
    await page.waitForTimeout(2500);
    // Propriétés (où s'affiche "N éléments sélectionnés") est un autre
    // onglet du même inspecteur — pas rendu tant que Calques reste actif.
    await page.getByRole("tab", { name: "Propriétés" }).click();

    const canvasBox = await page.locator("canvas").first().boundingBox();
    if (!canvasBox) throw new Error("Canvas introuvable");
    // Calques liste en ordre INVERSE d'insertion (dernier inséré = premier
    // affiché) — "Rectangle (1)" verrouillé ci-dessus est donc le SECOND
    // rectangle inséré, celui à x=400 (écran ~480,110) ; le premier inséré
    // (x=60, écran ~140,110) reste déverrouillé.
    // Sélection MANUELLE (clic + Shift+clic), pas par glisser : un glisser
    // ignore volontairement les éléments verrouillés (voir canvas-stage.tsx),
    // donc il ne capturerait que le rectangle déverrouillé — le clic direct,
    // lui, reste possible sur un élément verrouillé (c'est la seule façon de
    // le retrouver pour le déverrouiller).
    await page.mouse.click(canvasBox.x + 480, canvasBox.y + 110);
    await page.waitForTimeout(200);
    await page.keyboard.down("Shift");
    await page.mouse.click(canvasBox.x + 140, canvasBox.y + 110);
    await page.keyboard.up("Shift");
    await expect(page.getByText("2 éléments sélectionnés")).toBeVisible();

    await page.keyboard.press("Delete");
    await page.waitForTimeout(2500);

    const elements = await readElements(title);
    expect(elements).toHaveLength(1);
    expect(elements[0].locked).toBe(true);
  });
});
