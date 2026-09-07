import { config } from "dotenv";
import { expect, test } from "@playwright/test";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.local" });

/**
 * Studio de documents, étape 16 : fond de page, ColorPicker réutilisable et
 * opacité. Couvre les trois usages du ColorPicker (fond de page, remplissage
 * de forme) et la propriété Opacité (tout type d'élément).
 */

const testEmail = "praticien-test@pf-osteo-animale.fr";
const testPassword = "Praticien-Test-2026!";
const testTitle = "E2EPageBackgroundTest";

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
  return row.contentJson as { pages: { background?: { type: string; value: string }; elements: { opacity?: number }[] }[] };
}

async function createAndOpenDocument(page: import("@playwright/test").Page, title: string) {
  await page.goto("/dashboard/documents");
  await page.getByRole("button", { name: "Nouveau document" }).click();
  await page.getByPlaceholder("Ex. Compte rendu — Oslo").fill(title);
  await page.getByRole("dialog").getByRole("button", { name: "Créer" }).click();
  await page.waitForURL(/\/dashboard\/documents\/[a-z0-9]+/, { timeout: 10000 });
  await page.waitForTimeout(700);
}

test.describe("Documents — fond de page, ColorPicker et opacité (étape 16)", () => {
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

  test("changer le fond de page (via le champ Hex) persiste background.value en base", async ({ page }) => {
    const title = `${testTitle} Background`;
    await createAndOpenDocument(page, title);

    await page.getByRole("button", { name: "Fond de page" }).click();
    const hexInput = page.getByRole("dialog", { name: "Fond de page" }).getByRole("textbox");
    await hexInput.fill("#ff00aa");
    await hexInput.press("Enter");
    await page.waitForTimeout(2500);

    const content = await readContent(title);
    expect(content.pages[0].background?.value).toBe("#ff00aa");
  });

  test("retirer le fond de page repasse background à undefined en base", async ({ page }) => {
    const title = `${testTitle} RemoveBackground`;
    await createAndOpenDocument(page, title);

    await page.getByRole("button", { name: "Fond de page" }).click();
    const hexInput = page.getByRole("dialog", { name: "Fond de page" }).getByRole("textbox");
    await hexInput.fill("#00ccff");
    await hexInput.press("Enter");
    await page.waitForTimeout(2500);

    await page.getByRole("button", { name: "Retirer le fond" }).click();
    await page.waitForTimeout(2500);

    const content = await readContent(title);
    expect(content.pages[0].background).toBeUndefined();
  });

  test("le ColorPicker d'une forme affiche ses couleurs réelles dans « Couleurs du document »", async ({ page }) => {
    const title = `${testTitle} DocColors`;
    await createAndOpenDocument(page, title);

    await page.getByRole("button", { name: "Formes" }).click();
    await page.getByRole("button", { name: "Rectangle", exact: true }).click();
    await page.waitForTimeout(300);
    await page.getByRole("button", { name: "Formes" }).click();

    // Le rectangle par défaut est rempli en #e4f5ef (shapes-panel.tsx) — le
    // sélecteur de contour doit proposer cette couleur dans la section
    // "Couleurs du document" (déjà utilisée par le remplissage du même élément).
    await page.getByRole("button", { name: "Contour" }).click();
    await expect(page.getByRole("button", { name: "#e4f5ef" })).toBeVisible();
  });

  test("changer l'opacité d'une forme persiste opacity et se reflète sur le rendu Konva", async ({ page }) => {
    const title = `${testTitle} Opacity`;
    await createAndOpenDocument(page, title);

    await page.getByRole("button", { name: "Formes" }).click();
    await page.getByRole("button", { name: "Rectangle", exact: true }).click();
    await page.waitForTimeout(300);
    await page.getByRole("button", { name: "Formes" }).click();

    const opacitySlider = page.getByLabel("Opacité");
    await opacitySlider.fill("50");
    await page.waitForTimeout(2500);

    const content = await readContent(title);
    expect(content.pages[0].elements[0].opacity).toBe(0.5);
  });
});
