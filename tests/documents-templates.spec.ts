import { config } from "dotenv";
import { expect, test } from "@playwright/test";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.local" });

/**
 * Studio de documents, étape 3 : templates, variables Animéo, Smart Blocks.
 */

const testEmail = "praticien-test@pf-osteo-animale.fr";
const testPassword = "Praticien-Test-2026!";
const testTitle = "E2ETemplatesTest";

async function cleanupDocuments() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`DELETE FROM "StudioDocument" WHERE title LIKE ${testTitle + "%"}`;
}

async function clearLoginRateLimit() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`DELETE FROM "RateLimitEvent" WHERE key LIKE 'login:%'`;
}

test.describe("Documents — templates, variables et Smart Blocks (étape 3)", () => {
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

  test("créer un document depuis le modèle « Compte rendu chien » charge le contenu du modèle", async ({ page }) => {
    const sql = neon(process.env.DATABASE_URL!);
    const title = `${testTitle} Chien`;

    await page.goto("/dashboard/documents");
    await page.getByRole("button", { name: "Nouveau document" }).click();
    await page.getByPlaceholder("Ex. Compte rendu — Oslo").fill(title);

    // Galerie visuelle (étape 7) : chaque modèle affiche un croquis de mise
    // en page réel (couleurs/positions), pas juste un bouton texte.
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Compte rendu chien")).toBeVisible();
    expect(await dialog.getByTestId("template-sketch").count()).toBe(5);

    await dialog.getByRole("button", { name: "Compte rendu chien" }).click();
    await dialog.getByRole("button", { name: "Créer" }).click();
    await page.waitForURL(/\/dashboard\/documents\/[a-z0-9]+/, { timeout: 10000 });
    await page.waitForTimeout(800);

    const [templateRow] = await sql`SELECT id, "contentJson" FROM "StudioDocumentTemplate" WHERE name = 'Compte rendu chien'`;
    const templateContent = templateRow.contentJson as { pages: { elements: unknown[] }[] };

    const [documentRow] = await sql`SELECT "templateId", "contentJson" FROM "StudioDocument" WHERE title = ${title}`;
    expect(documentRow.templateId).toBe(templateRow.id);
    const documentContent = documentRow.contentJson as { pages: { elements: unknown[] }[] };
    expect(documentContent.pages[0].elements.length).toBe(templateContent.pages[0].elements.length);

    await expect(page.getByText("Compte rendu de consultation")).toBeVisible();
  });

  test("une variable Animéo affiche la vraie donnée résolue et n'est pas éditable au double-clic", async ({ page }) => {
    const sql = neon(process.env.DATABASE_URL!);
    const title = `${testTitle} Variable`;
    const [profile] = await sql`SELECT company FROM "BusinessProfile" LIMIT 1`;

    await page.goto("/dashboard/documents");
    await page.getByRole("button", { name: "Nouveau document" }).click();
    await page.getByPlaceholder("Ex. Compte rendu — Oslo").fill(title);
    await page.getByRole("dialog").getByRole("button", { name: "Créer" }).click();
    await page.waitForURL(/\/dashboard\/documents\/[a-z0-9]+/, { timeout: 10000 });
    await page.waitForTimeout(600);

    await page.getByRole("button", { name: "Données" }).click();
    await page.getByRole("button", { name: "Nom du cabinet" }).click();
    await page.waitForTimeout(2500);

    await expect(page.getByText(profile.company, { exact: true })).toBeVisible();

    await page.getByText(profile.company, { exact: true }).dblclick({ force: true });
    await page.waitForTimeout(300);
    await expect(page.locator(".outline-animeo")).toHaveCount(0);

    const [row] = await sql`SELECT "contentJson" FROM "StudioDocument" WHERE title = ${title}`;
    const content = row.contentJson as { pages: { elements: { variableBinding?: string }[] }[] };
    expect(content.pages[0].elements.some((element) => element.variableBinding === "professional.company")).toBe(true);
  });

  test("un Smart Block s'insère en un seul clic et s'annule en un seul Ctrl+Z", async ({ page }) => {
    const sql = neon(process.env.DATABASE_URL!);
    const title = `${testTitle} SmartBlock`;

    await page.goto("/dashboard/documents");
    await page.getByRole("button", { name: "Nouveau document" }).click();
    await page.getByPlaceholder("Ex. Compte rendu — Oslo").fill(title);
    await page.getByRole("dialog").getByRole("button", { name: "Créer" }).click();
    await page.waitForURL(/\/dashboard\/documents\/[a-z0-9]+/, { timeout: 10000 });
    await page.waitForTimeout(600);

    await page.getByRole("button", { name: "Blocs" }).click();
    await page.getByRole("button", { name: "Carte animal" }).click();
    await page.waitForTimeout(2500);

    const [afterInsert] = await sql`SELECT "contentJson" FROM "StudioDocument" WHERE title = ${title}`;
    // 1 rect + 6 champs (légende + valeur) enrichis à l'étape 9 = 13, plus
    // seulement les 6 éléments d'origine de l'étape 3.
    const contentAfterInsert = afterInsert.contentJson as { pages: { elements: unknown[] }[] };
    expect(contentAfterInsert.pages[0].elements.length).toBe(13);

    await page.keyboard.press("Control+z");
    await page.waitForTimeout(2500);

    const [afterUndo] = await sql`SELECT "contentJson" FROM "StudioDocument" WHERE title = ${title}`;
    const contentAfterUndo = afterUndo.contentJson as { pages: { elements: unknown[] }[] };
    expect(contentAfterUndo.pages[0].elements.length).toBe(0);
  });

  for (const templateName of ["Compte rendu chat", "Compte rendu équin", "Séance de suivi"]) {
    test(`créer un document depuis le modèle « ${templateName} » (étape 7) persiste le bon templateId`, async ({ page }) => {
      const sql = neon(process.env.DATABASE_URL!);
      const title = `${testTitle} ${templateName}`;

      await page.goto("/dashboard/documents");
      await page.getByRole("button", { name: "Nouveau document" }).click();
      await page.getByPlaceholder("Ex. Compte rendu — Oslo").fill(title);
      await page.getByRole("dialog").getByRole("button", { name: templateName }).click();
      await page.getByRole("dialog").getByRole("button", { name: "Créer" }).click();
      await page.waitForURL(/\/dashboard\/documents\/[a-z0-9]+/, { timeout: 10000 });
      await page.waitForTimeout(700);

      const [templateRow] = await sql`SELECT id, "contentJson" FROM "StudioDocumentTemplate" WHERE name = ${templateName}`;
      const templateContent = templateRow.contentJson as { pages: { elements: unknown[] }[] };
      const [documentRow] = await sql`SELECT "templateId", "contentJson" FROM "StudioDocument" WHERE title = ${title}`;
      expect(documentRow.templateId).toBe(templateRow.id);
      const documentContent = documentRow.contentJson as { pages: { elements: unknown[] }[] };
      expect(documentContent.pages[0].elements.length).toBe(templateContent.pages[0].elements.length);
    });
  }

  test("« Compte rendu classique » est le modèle générique proposé pour une espèce sans modèle dédié", async ({ page }) => {
    const sql = neon(process.env.DATABASE_URL!);
    await sql`INSERT INTO "Client" (id, "firstName", "lastName", phone, email, city, address, "updatedAt") VALUES ('tmp-e2e-tmpl-client', 'Test', 'E2ETemplatesTest', '0600000000', 'e2e-tmpl@example.fr', 'Rouen', '1 rue Test', now())`;
    await sql`INSERT INTO "Animal" (id, "clientId", name, species, breed, age, weight, sex, avatar, "avatarBackground", history, conditions, treatments, notes, "updatedAt") VALUES ('tmp-e2e-tmpl-animal', 'tmp-e2e-tmpl-client', 'AnimalNAC', 'NAC', '', '', '', '', '', '', '', '', '', '', now())`;

    try {
      await page.goto("/dashboard/clients/tmp-e2e-tmpl-client");
      await page.waitForTimeout(800);
      await page.getByRole("button", { name: "Nouveau compte rendu" }).click();
      await page.waitForURL(/\/dashboard\/documents\/[a-z0-9]+/, { timeout: 10000 });

      const [classicRow] = await sql`SELECT id FROM "StudioDocumentTemplate" WHERE name = 'Compte rendu classique'`;
      const [documentRow] = await sql`SELECT "templateId" FROM "StudioDocument" WHERE "animalId" = 'tmp-e2e-tmpl-animal'`;
      expect(documentRow.templateId).toBe(classicRow.id);
    } finally {
      await sql`DELETE FROM "StudioDocument" WHERE "animalId" = 'tmp-e2e-tmpl-animal'`;
      await sql`DELETE FROM "Animal" WHERE id = 'tmp-e2e-tmpl-animal'`;
      await sql`DELETE FROM "Client" WHERE id = 'tmp-e2e-tmpl-client'`;
    }
  });
});
