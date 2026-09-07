import { config } from "dotenv";
import { expect, test } from "@playwright/test";
import { neon } from "@neondatabase/serverless";
import { hexToHsv } from "../src/components/documents/editor/color-math";

config({ path: ".env.local" });

/**
 * Studio de documents, étape 21 : roue chromatique (teinte/saturation en
 * CSS conic+radial gradient, luminosité séparée) et favoris de couleurs
 * dans le ColorPicker. Les angles de clic ont été vérifiés manuellement
 * avant d'écrire ces assertions (voir le plan) — cliquer en haut de la
 * roue donne la teinte 0° (rouge), à droite la teinte 90°.
 */

const testEmail = "praticien-test@pf-osteo-animale.fr";
const testPassword = "Praticien-Test-2026!";
const testTitle = "E2EColorWheelTest";

async function cleanupDocuments() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`DELETE FROM "StudioDocument" WHERE title LIKE ${testTitle + "%"}`;
}

async function clearLoginRateLimit() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`DELETE FROM "RateLimitEvent" WHERE key LIKE 'login:%'`;
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
}

test.describe("Documents — roue chromatique et favoris de couleurs (étape 21)", () => {
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

  test("cliquer en haut de la roue produit une teinte proche de 0° (rouge) à forte saturation", async ({ page }) => {
    const title = `${testTitle} TopClick`;
    await createDocumentWithRectangle(page, title);

    await page.getByRole("button", { name: "Remplissage" }).click();
    const wheel = page.getByLabel(/Roue chromatique/);
    const box = await wheel.boundingBox();
    if (!box) throw new Error("Roue introuvable");

    await page.mouse.click(box.x + box.width / 2, box.y + 2);
    await page.waitForTimeout(150);

    const hex = await page.locator('input[type="text"]').first().inputValue();
    const hsv = hexToHsv(hex);
    expect(hsv.h < 5 || hsv.h > 355).toBe(true);
    expect(hsv.s).toBeGreaterThan(85);
  });

  test("cliquer à droite de la roue produit une teinte proche de 90°", async ({ page }) => {
    const title = `${testTitle} RightClick`;
    await createDocumentWithRectangle(page, title);

    await page.getByRole("button", { name: "Remplissage" }).click();
    const wheel = page.getByLabel(/Roue chromatique/);
    const box = await wheel.boundingBox();
    if (!box) throw new Error("Roue introuvable");

    await page.mouse.click(box.x + box.width - 2, box.y + box.height / 2);
    await page.waitForTimeout(150);

    const hex = await page.locator('input[type="text"]').first().inputValue();
    const hsv = hexToHsv(hex);
    expect(Math.abs(hsv.h - 90)).toBeLessThan(10);
  });

  test("le curseur de Luminosité assombrit bien la couleur (valeur HSV réduite)", async ({ page }) => {
    const title = `${testTitle} Brightness`;
    await createDocumentWithRectangle(page, title);

    await page.getByRole("button", { name: "Remplissage" }).click();
    await page.getByLabel("Luminosité").fill("30");
    await page.waitForTimeout(150);

    const hex = await page.locator('input[type="text"]').first().inputValue();
    const hsv = hexToHsv(hex);
    expect(hsv.v).toBeLessThan(35);
  });

  test("ajouter la couleur courante aux favoris la fait apparaître dans « Couleurs favorites » à la réouverture", async ({ page }) => {
    const title = `${testTitle} Favorite`;
    await createDocumentWithRectangle(page, title);

    await page.getByRole("button", { name: "Remplissage" }).click();
    const hexBefore = await page.locator('input[type="text"]').first().inputValue();
    await page.getByRole("button", { name: "Ajouter aux favoris" }).click();
    await page.waitForTimeout(200);

    // Ferme puis rouvre pour vérifier une vraie persistance localStorage.
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Remplissage" }).click();

    await expect(page.getByText("Couleurs favorites")).toBeVisible();
    const favoritesGroup = page.getByText("Couleurs favorites").locator("..");
    await expect(favoritesGroup.getByRole("button", { name: hexBefore, exact: true })).toBeVisible();
  });
});
