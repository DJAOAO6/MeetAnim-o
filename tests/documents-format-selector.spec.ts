import { config } from "dotenv";
import { expect, test } from "@playwright/test";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.local" });

/**
 * Studio de documents, étape 26 : sélecteur de format de document (affiche
 * A3, posts Instagram carré/portrait, en plus d'A4 portrait/paysage).
 */

const testEmail = "praticien-test@pf-osteo-animale.fr";
const testPassword = "Praticien-Test-2026!";
const testTitle = "E2EFormatTest";

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
  return row.contentJson as { pageSize: string; pages: { elements: unknown[] }[] };
}

test.describe("Documents — sélecteur de format (étape 26)", () => {
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

  for (const [label, pageSize] of [
    ["Affiche (A3)", "POSTER_A3_PORTRAIT"],
    ["Post Instagram carré", "SOCIAL_SQUARE"],
    ["Post Instagram portrait", "SOCIAL_PORTRAIT"],
  ] as const) {
    test(`créer un document au format « ${label} » persiste le bon pageSize et les bonnes dimensions de page`, async ({ page }) => {
      const title = `${testTitle} ${pageSize}`;
      await page.goto("/dashboard/documents");
      await page.getByRole("button", { name: "Nouveau document" }).click();
      await page.getByPlaceholder("Ex. Compte rendu — Oslo").fill(title);
      await page.getByRole("button", { name: label }).click();
      await page.getByRole("dialog").getByRole("button", { name: "Créer" }).click();
      await page.waitForURL(/\/dashboard\/documents\/[a-z0-9]+/, { timeout: 10000 });
      await page.waitForTimeout(700);

      const content = await readContent(title);
      expect(content.pageSize).toBe(pageSize);

      const canvasBox = await page.locator("canvas").first().boundingBox();
      expect(canvasBox).toBeTruthy();
      if (pageSize === "SOCIAL_SQUARE") {
        expect(Math.abs((canvasBox!.width ?? 0) - (canvasBox!.height ?? 0))).toBeLessThan(2);
      } else {
        expect(canvasBox!.height).toBeGreaterThan(canvasBox!.width);
      }
    });
  }

  test("choisir un format non-A4-portrait désactive la galerie de modèles dans le dialogue", async ({ page }) => {
    await page.goto("/dashboard/documents");
    await page.getByRole("button", { name: "Nouveau document" }).click();

    const dialog = page.getByRole("dialog");
    // Par défaut (Portrait A4), la galerie de modèles est visible si des
    // modèles existent (seedés, voir prisma/seed-document-templates.ts).
    await expect(dialog.getByText("Modèle", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Post Instagram carré" }).click();
    await expect(dialog.getByText("Modèle", { exact: true })).toHaveCount(0);

    // Revenir à Portrait (A4) réaffiche la galerie.
    await page.getByRole("button", { name: "Portrait (A4)" }).click();
    await expect(dialog.getByText("Modèle", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Annuler" }).click();
  });

  test("finaliser un document à 2 pages en format SOCIAL_SQUARE (paysage/carré) produit bien un PDF à 2 pages", async ({ page }) => {
    // Régression du bug d'orientation codée en dur trouvé à l'audit :
    // pdf.addPage([width,height], "portrait") ignorait le format réel — pour
    // un format carré/paysage sur un document multipage, c'est désormais le
    // seul chemin de code qui l'exerce réellement (A4 seul ne l'aurait
    // jamais révélé). Le test vérifie juste que la finalisation multipage
    // continue de fonctionner sur ce format, pas les dimensions exactes du
    // PDF (déjà couvert pour A4 par documents-zoom-pages.spec.ts).
    const sql = neon(process.env.DATABASE_URL!);
    const title = `${testTitle} PdfSquare`;
    await page.goto("/dashboard/documents");
    await page.getByRole("button", { name: "Nouveau document" }).click();
    await page.getByPlaceholder("Ex. Compte rendu — Oslo").fill(title);
    await page.getByRole("button", { name: "Post Instagram carré" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Créer" }).click();
    await page.waitForURL(/\/dashboard\/documents\/[a-z0-9]+/, { timeout: 10000 });
    await page.waitForTimeout(700);

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
});
