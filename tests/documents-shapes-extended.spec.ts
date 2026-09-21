import { config } from "dotenv";
import { expect, test } from "@playwright/test";
import { neon } from "./helpers/sql";

config({ path: ".env.local" });

/**
 * Studio de documents, étape 19 : formes étendues (ellipse, triangle,
 * hexagone, losange, étoile) + préréglages de rectangle (arrondi, badge) +
 * correction du système de coordonnées des formes centrées chez Konva
 * (Circle et les nouvelles formes centrées utilisent désormais offsetX/Y
 * pour que x/y reste le coin haut-gauche, comme toutes les autres formes —
 * voir canvas-stage.tsx et le plan).
 */

const testEmail = "praticien-test@pf-osteo-animale.fr";
const testPassword = "Praticien-Test-2026!";
const testTitle = "E2EShapesExtendedTest";

// Position par défaut à l'insertion (element-factory.ts) — si le correctif
// de coordonnées régresse, une forme centrée (ex. cercle) n'aurait plus ce
// x/y exact pour son coin haut-gauche.
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
  // Le zoom s'ajuste désormais à l'ouverture pour que la page entière
  // tienne à l'écran : ce test raisonne en coordonnées document
  // (canvasBox.x + 60 = x:60 de la page), il lui faut donc l'échelle 1:1.
  await page.getByRole("button", { name: "Réinitialiser le zoom à 100 %" }).click();
  await page.waitForTimeout(200);
}

async function readElements(title: string) {
  const sql = neon(process.env.DATABASE_URL!);
  const [row] = await sql`SELECT "contentJson" FROM "StudioDocument" WHERE title = ${title}`;
  const content = row.contentJson as { pages: { elements: { shape?: string; x: number; y: number; cornerRadius?: number }[] }[] };
  return content.pages[0].elements;
}

test.describe("Documents — formes étendues et correction de coordonnées (étape 19)", () => {
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

  test("insérer chacune des 5 nouvelles formes persiste le bon type et x/y sans dérive de coordonnées", async ({ page }) => {
    const title = `${testTitle} NewShapes`;
    await createAndOpenDocument(page, title);

    await page.getByRole("button", { name: "Formes" }).click();
    for (const label of ["Ellipse", "Triangle", "Hexagone", "Losange", "Étoile"]) {
      await page.getByRole("button", { name: label, exact: true }).click();
      await page.waitForTimeout(200);
    }
    await page.getByRole("button", { name: "Formes" }).click();
    await page.waitForTimeout(2500);

    const elements = await readElements(title);
    expect(elements).toHaveLength(5);
    const shapes = elements.map((element) => element.shape);
    expect(shapes).toEqual(["ellipse", "triangle", "hexagon", "diamond", "star"]);
    for (const element of elements) {
      expect(element.x).toBe(DEFAULT_X);
      expect(element.y).toBe(DEFAULT_Y);
    }
  });

  test("les préréglages Rectangle arrondi et Badge persistent le bon cornerRadius", async ({ page }) => {
    const title = `${testTitle} Presets`;
    await createAndOpenDocument(page, title);

    await page.getByRole("button", { name: "Formes" }).click();
    await page.getByRole("button", { name: "Rectangle arrondi", exact: true }).click();
    await page.waitForTimeout(200);
    await page.getByRole("button", { name: "Badge", exact: true }).click();
    await page.waitForTimeout(200);
    await page.getByRole("button", { name: "Formes" }).click();
    await page.waitForTimeout(2500);

    const elements = await readElements(title);
    expect(elements[0].shape).toBe("rect");
    expect(elements[0].cornerRadius).toBe(20);
    expect(elements[1].shape).toBe("rect");
    expect(elements[1].cornerRadius).toBe(22);
  });

  test("une sélection par glisser couvrant un cercle nouvellement inséré le sélectionne bien (régression boîte englobante)", async ({ page }) => {
    const title = `${testTitle} CircleMarquee`;
    await createAndOpenDocument(page, title);

    await page.getByRole("button", { name: "Formes" }).click();
    await page.getByRole("button", { name: "Cercle", exact: true }).click();
    await page.waitForTimeout(300);
    await page.getByRole("button", { name: "Formes" }).click();

    // Cercle par défaut : x=60,y=60,w=120,h=120. Un glisser couvrant
    // exactement cette zone (et pas plus) ne le sélectionne QUE si x/y est
    // bien traité comme le coin haut-gauche partout (sinon la boîte
    // englobante réellement testée serait décalée d'un demi-diamètre).
    const canvasBox = await page.locator("canvas").first().boundingBox();
    if (!canvasBox) throw new Error("Canvas introuvable");
    // Désélectionne d'abord : l'insertion sélectionne déjà le cercle, dont
    // la poignée de redimensionnement haut-gauche du Transformer se trouve
    // pile à (60,60) — démarrer le glisser à (55,55) l'attraperait au lieu
    // de démarrer une sélection par glisser.
    await page.mouse.click(canvasBox.x + 400, canvasBox.y + 400);
    await page.waitForTimeout(200);
    await page.mouse.move(canvasBox.x + 20, canvasBox.y + 20);
    await page.mouse.down();
    await page.mouse.move(canvasBox.x + 185, canvasBox.y + 185, { steps: 10 });
    await page.mouse.up();

    await expect(page.getByLabel("Position X")).toHaveValue("60");
    await expect(page.getByLabel("Position Y")).toHaveValue("60");
  });
});
