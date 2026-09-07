import { config } from "dotenv";
import { expect, test } from "@playwright/test";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.local" });

/**
 * Studio de documents, étape 17 : sélecteur de police (recherche, favoris,
 * récentes). `setFontFamily` vient de TextStyleKit (déjà inclus, aucune
 * nouvelle dépendance) — la chaîne HTML sérialisée a été vérifiée
 * manuellement avant d'écrire ces assertions (voir le plan).
 */

const testEmail = "praticien-test@pf-osteo-animale.fr";
const testPassword = "Praticien-Test-2026!";
const testTitle = "E2ETypographyTest";

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

async function addAndEditTextBlock(page: import("@playwright/test").Page, text: string) {
  await page.getByRole("button", { name: "Texte" }).click();
  await page.getByRole("button", { name: "Bloc de texte" }).click();
  await page.waitForTimeout(400);
  await page.keyboard.type(text);
  await page.keyboard.press("Control+a");
}

async function readContentHtml(title: string): Promise<string> {
  const sql = neon(process.env.DATABASE_URL!);
  const [row] = await sql`SELECT "contentJson" FROM "StudioDocument" WHERE title = ${title}`;
  const content = row.contentJson as { pages: { elements: { type: string; html?: string }[] }[] };
  return content.pages[0].elements.find((element) => element.type === "text")?.html ?? "";
}

test.describe("Documents — sélecteur de police (étape 17)", () => {
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

  test("choisir une police persiste bien font-family dans le HTML enregistré", async ({ page }) => {
    const title = `${testTitle} Choose`;
    await createAndOpenDocument(page, title);
    await addAndEditTextBlock(page, "Texte en Poppins");

    await page.getByRole("button", { name: "Police" }).click();
    await page.getByRole("button", { name: "Poppins", exact: true }).click();
    await page.waitForTimeout(2500);

    const html = await readContentHtml(title);
    expect(html).toContain("font-family: var(--font-poppins);");
  });

  test("la recherche filtre bien la liste des polices", async ({ page }) => {
    const title = `${testTitle} Search`;
    await createAndOpenDocument(page, title);
    await addAndEditTextBlock(page, "Texte");

    await page.getByRole("button", { name: "Police" }).click();
    await expect(page.getByRole("button", { name: "Oswald", exact: true })).toBeVisible();
    await page.getByRole("textbox", { name: "Rechercher une police" }).fill("Playfair");
    await expect(page.getByRole("button", { name: "Playfair Display", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Oswald", exact: true })).toHaveCount(0);
  });

  test("un favori ajouté apparaît dans la section Favoris à la réouverture du panneau", async ({ page }) => {
    const title = `${testTitle} Favorite`;
    await createAndOpenDocument(page, title);
    await addAndEditTextBlock(page, "Texte");

    await page.getByRole("button", { name: "Police" }).click();
    await page.getByRole("button", { name: "Ajouter Lora aux favoris" }).click();
    // Ferme puis rouvre le panneau pour vérifier une vraie persistance
    // (localStorage), pas juste un état de composant qui n'aurait pas bougé.
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Police" }).click();

    await expect(page.getByText("⭐ Favoris")).toBeVisible();
    const favoritesGroup = page.getByText("⭐ Favoris").locator("..");
    await expect(favoritesGroup.getByRole("button", { name: "Lora", exact: true })).toBeVisible();
  });
});
