import { config } from "dotenv";
import { expect, test } from "@playwright/test";
import { neon } from "./helpers/sql";

config({ path: ".env.local" });

/**
 * Studio de documents, étape 10 : zoom, multipage léger, catégorie
 * "Modèles" du rail (insertion comme nouvelle page).
 */

const testEmail = "praticien-test@pf-osteo-animale.fr";
const testPassword = "Praticien-Test-2026!";
const testTitle = "E2EZoomPagesTest";

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

async function readContent(title: string) {
  const sql = neon(process.env.DATABASE_URL!);
  const [row] = await sql`SELECT "contentJson" FROM "StudioDocument" WHERE title = ${title}`;
  return row.contentJson as { pages: { elements: { type: string; x: number }[] }[] };
}

test.describe("Documents — zoom, multipage et Modèles du rail (étape 10)", () => {
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

  test("le zoom change l'affichage et la sélection au clic reste correcte à 150%", async ({ page }) => {
    const title = `${testTitle} Zoom`;
    await createAndOpenDocument(page, title);

    await page.getByRole("button", { name: "Formes" }).click();
    await page.getByRole("button", { name: "Rectangle", exact: true }).click();
    await page.waitForTimeout(300);
    // Désélectionne (clic sur une zone vide du canevas) pour repartir d'un
    // état neutre avant de re-sélectionner au clic ci-dessous.
    await page.locator("canvas").first().click({ position: { x: 500, y: 500 } });
    await page.waitForTimeout(200);

    await page.getByRole("button", { name: "Augmenter le zoom" }).click();
    await page.getByRole("button", { name: "Augmenter le zoom" }).click();
    await expect(page.getByRole("button", { name: "Réinitialiser le zoom à 100 %" })).toHaveText("150%");

    // Le rectangle par défaut occupe [60,220]x[60,160] en coordonnées logiques
    // — cliquer à (100,100) en pixels CSS (donc ~(66,66) en logique une fois
    // le facteur 150% appliqué) doit toujours tomber dedans.
    await page.locator("canvas").first().click({ position: { x: 100, y: 100 } });
    await page.waitForTimeout(300);
    await expect(page.getByLabel("Position X")).toHaveValue("60");
  });

  test("ajouter une page persiste un contenu indépendant par page", async ({ page }) => {
    const title = `${testTitle} Pages`;
    await createAndOpenDocument(page, title);

    await page.getByRole("button", { name: "Ajouter une page" }).click();
    await page.waitForTimeout(2500);

    let content = await readContent(title);
    expect(content.pages.length).toBe(2);

    // La page 2 est active après ajout — y insérer un élément ne doit pas
    // toucher la page 1.
    await page.getByRole("button", { name: "Formes" }).click();
    await page.getByRole("button", { name: "Rectangle", exact: true }).click();
    await page.waitForTimeout(2500);

    content = await readContent(title);
    expect(content.pages[1].elements.length).toBe(1);
    expect(content.pages[0].elements.length).toBe(0);
  });

  test("supprimer une page recale l'index courant sans erreur", async ({ page }) => {
    const title = `${testTitle} SupprPage`;
    await createAndOpenDocument(page, title);

    await page.getByRole("button", { name: "Ajouter une page" }).click();
    await page.waitForTimeout(600);
    await expect(page.getByRole("button", { name: "Page 2 ·" })).toBeVisible();

    await page.getByRole("button", { name: "Supprimer la page 2" }).click();
    await page.waitForTimeout(2500);

    const content = await readContent(title);
    expect(content.pages.length).toBe(1);
    await expect(page.getByRole("button", { name: "Page 2 ·" })).toHaveCount(0);
  });

  test("finaliser un document à 2 pages produit un PDF avec les 2 pages", async ({ page }) => {
    const sql = neon(process.env.DATABASE_URL!);
    const title = `${testTitle} PdfMultiPage`;
    await createAndOpenDocument(page, title);

    await page.getByRole("button", { name: "Ajouter une page" }).click();
    await page.waitForTimeout(2500);

    await page.getByRole("button", { name: "Finaliser" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Finaliser" }).click();
    await expect(page.getByText("Document finalisé.")).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(1000);

    const [row] = await sql`SELECT "pdfBase64" FROM "StudioDocument" WHERE title = ${title}`;
    const base64 = (row.pdfBase64 as string).split(",")[1];
    const pdfText = Buffer.from(base64, "base64").toString("latin1");
    const pageObjectMatches = pdfText.match(/\/Type\s*\/Page(?!s)/g) ?? [];
    expect(pageObjectMatches.length).toBe(2);
  });

  test("insérer un modèle depuis « Modèles » ajoute une nouvelle page avec le bon nombre d'éléments", async ({ page }) => {
    const sql = neon(process.env.DATABASE_URL!);
    const title = `${testTitle} InsertTemplate`;
    await createAndOpenDocument(page, title);

    const [templateRow] = await sql`SELECT "contentJson" FROM "StudioDocumentTemplate" WHERE name = 'Compte rendu chien'`;
    const templateContent = templateRow.contentJson as { pages: { elements: unknown[] }[] };
    const expectedCount = templateContent.pages[0].elements.length;

    await page.getByRole("button", { name: "Modèles" }).click();
    await page.getByRole("button", { name: "Compte rendu chien" }).click();
    // Ce modèle a beaucoup d'éléments (46) — la marge habituelle de 2500ms
    // s'est révélée insuffisante à l'usage (l'UI reflétait déjà les 2 pages
    // correctement, mais la lecture DB survenait parfois avant la fin de
    // l'autosave débouncée pour un payload aussi volumineux).
    await page.waitForTimeout(3500);

    const content = await readContent(title);
    expect(content.pages.length).toBe(2);
    expect(content.pages[1].elements.length).toBe(expectedCount);
  });
});
