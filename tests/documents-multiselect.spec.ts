import { config } from "dotenv";
import { expect, test } from "@playwright/test";
import { neon } from "./helpers/sql";

config({ path: ".env.local" });

/**
 * Studio de documents, étape 13 : sélection multiple (Shift+clic additif,
 * sélection par glisser). Fondation du chantier "Studio avancé" — les
 * actions dupliquer/supprimer opèrent déjà sur toute la sélection, voir
 * document-store.ts.
 */

const testEmail = "praticien-test@pf-osteo-animale.fr";
const testPassword = "Praticien-Test-2026!";
const testTitle = "E2EMultiselectTest";

async function cleanupDocuments() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`DELETE FROM "StudioDocument" WHERE title LIKE ${testTitle + "%"}`;
}

async function clearLoginRateLimit() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`DELETE FROM "RateLimitEvent" WHERE key LIKE 'login:%'`;
}

async function readContent(title: string) {
  const sql = neon(process.env.DATABASE_URL!);
  const [row] = await sql`SELECT "contentJson" FROM "StudioDocument" WHERE title = ${title}`;
  return row.contentJson as { pages: { elements: { id: string; type: string; x: number; y: number }[] }[] };
}

// Deux rectangles bien séparés (60,60) et (400,60), en fermant le panneau
// Formes après coup — son bouton "Rectangle" entre en collision avec le
// libellé du même nom ailleurs dans l'UI, convention déjà établie dans les
// autres specs Studio.
async function createDocumentWithTwoRectangles(page: import("@playwright/test").Page, title: string) {
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

  const canvasBox = await page.locator("canvas").first().boundingBox();
  if (!canvasBox) throw new Error("Canvas introuvable");
  return canvasBox;
}

test.describe("Documents — sélection multiple (étape 13)", () => {
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

  test("Shift+clic sélectionne 2 éléments : Ctrl+D les duplique tous les deux en une seule action annulable", async ({ page }) => {
    const title = `${testTitle} ShiftClick`;
    const canvasBox = await createDocumentWithTwoRectangles(page, title);

    await page.mouse.click(canvasBox.x + 140, canvasBox.y + 110);
    await page.waitForTimeout(200);
    await page.keyboard.down("Shift");
    await page.mouse.click(canvasBox.x + 480, canvasBox.y + 110);
    await page.keyboard.up("Shift");
    await expect(page.getByText("2 éléments sélectionnés")).toBeVisible();

    await page.keyboard.press("Control+d");
    await page.waitForTimeout(2500);
    let content = await readContent(title);
    expect(content.pages[0].elements).toHaveLength(4);

    // Un seul Ctrl+Z doit retirer les 2 copies d'un coup, pas une par une.
    await page.keyboard.press("Control+z");
    await page.waitForTimeout(2500);
    content = await readContent(title);
    expect(content.pages[0].elements).toHaveLength(2);
  });

  test("sélection par glisser sur une zone couvrant 2 formes les sélectionne toutes les deux", async ({ page }) => {
    const title = `${testTitle} Marquee`;
    const canvasBox = await createDocumentWithTwoRectangles(page, title);

    await page.mouse.move(canvasBox.x + 10, canvasBox.y + 10);
    await page.mouse.down();
    await page.mouse.move(canvasBox.x + 550, canvasBox.y + 200, { steps: 10 });
    await page.mouse.up();

    await expect(page.getByText("2 éléments sélectionnés")).toBeVisible();
  });

  test("Suppr sur une sélection multiple supprime réellement les deux éléments en base", async ({ page }) => {
    const title = `${testTitle} DeleteMulti`;
    const canvasBox = await createDocumentWithTwoRectangles(page, title);

    await page.mouse.move(canvasBox.x + 10, canvasBox.y + 10);
    await page.mouse.down();
    await page.mouse.move(canvasBox.x + 550, canvasBox.y + 200, { steps: 10 });
    await page.mouse.up();
    await expect(page.getByText("2 éléments sélectionnés")).toBeVisible();

    await page.keyboard.press("Delete");
    await page.waitForTimeout(2500);
    const content = await readContent(title);
    expect(content.pages[0].elements).toHaveLength(0);
  });

  test("relâcher le clic hors du canevas confirme immédiatement la sélection par glisser, sans re-clic", async ({ page }) => {
    const title = `${testTitle} MarqueeOutside`;
    const canvasBox = await createDocumentWithTwoRectangles(page, title);

    // Konva n'écoute mouseup (et mousemove) que sur le <canvas> du Stage —
    // relâcher hors de ses limites (ici à gauche, vers le rail/panneaux) est
    // un vrai scénario de glisser rapide. Un écouteur `window` doit
    // rattraper ce relâchement et confirmer la sélection tout de suite (bug
    // signalé par l'utilisateur : "il faut recliquer après pour que ça
    // confirme"). Le glisser part du CENTRE du premier rectangle (60,60 à
    // 220,160) pour que le dernier rectangle de sélection capturé avant la
    // sortie du canevas le recouvre déjà.
    await page.mouse.move(canvasBox.x + 100, canvasBox.y + 100);
    await page.mouse.down();
    await page.mouse.move(canvasBox.x - 40, canvasBox.y + 100, { steps: 15 });
    await page.mouse.up();

    await expect(page.getByLabel("Position X")).toBeVisible({ timeout: 1500 });
  });
});
