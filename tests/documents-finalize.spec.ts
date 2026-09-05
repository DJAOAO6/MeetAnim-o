import { config } from "dotenv";
import { expect, test } from "@playwright/test";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.local" });

/**
 * Studio de documents, étape 5 : finalisation + export PDF réel.
 */

const testEmail = "praticien-test@pf-osteo-animale.fr";
const testPassword = "Praticien-Test-2026!";
const testTitle = "E2EFinalizeTest";

async function cleanupDocuments() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`DELETE FROM "StudioDocument" WHERE title LIKE ${testTitle + "%"}`;
}

async function clearLoginRateLimit() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`DELETE FROM "RateLimitEvent" WHERE key LIKE 'login:%'`;
}

test.describe("Documents — finalisation et export PDF (étape 5)", () => {
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

  test("finaliser génère un vrai PDF + une miniature et verrouille l'édition", async ({ page }) => {
    const sql = neon(process.env.DATABASE_URL!);
    const title = `${testTitle} Export`;

    await page.goto("/dashboard/documents");
    await page.getByRole("button", { name: "Nouveau document" }).click();
    await page.getByPlaceholder("Ex. Compte rendu — Oslo").fill(title);
    await page.getByRole("dialog").getByRole("button", { name: "Compte rendu chien" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Créer" }).click();
    await page.waitForURL(/\/dashboard\/documents\/[a-z0-9]+/, { timeout: 10000 });
    await page.waitForTimeout(800);

    await page.getByRole("button", { name: "Finaliser" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Finaliser" }).click();
    await expect(page.getByText("Document finalisé.")).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(1000);

    const [row] = await sql`SELECT status, "pdfBase64", thumbnail FROM "StudioDocument" WHERE title = ${title}`;
    expect(row.status).toBe("FINALIZED");
    expect(row.pdfBase64 as string).toMatch(/^data:application\/pdf/);
    expect((row.pdfBase64 as string).length).toBeGreaterThan(1000);
    expect(row.thumbnail as string).toMatch(/^data:image\/jpeg/);

    await expect(page.getByText("Finalisé", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Texte" })).toBeDisabled();
    await expect(page.getByLabel("Titre du document")).toBeDisabled();
    await expect(page.getByRole("button", { name: "Finaliser" })).toBeDisabled();
  });
});
