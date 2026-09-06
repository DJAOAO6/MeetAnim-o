import { config } from "dotenv";
import { expect, test } from "@playwright/test";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.local" });

/**
 * Studio de documents, étape 9 : Smart Blocks enrichis (3 -> 8), tous de
 * simples préréglages `addElements()` (aucune nouvelle abstraction).
 */

const testEmail = "praticien-test@pf-osteo-animale.fr";
const testPassword = "Praticien-Test-2026!";
const testTitle = "E2ESmartBlocksTest";

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
  await page.getByRole("button", { name: "Blocs" }).click();
}

async function elementCount(title: string): Promise<number> {
  const sql = neon(process.env.DATABASE_URL!);
  const [row] = await sql`SELECT "contentJson" FROM "StudioDocument" WHERE title = ${title}`;
  const content = row.contentJson as { pages: { elements: unknown[] }[] };
  return content.pages[0].elements.length;
}

test.describe("Documents — Smart Blocks enrichis (étape 9)", () => {
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

  const newBlocks: { label: string; expectedCount: number }[] = [
    { label: "Infos rendez-vous", expectedCount: 9 },
    { label: "En-tête de document", expectedCount: 5 },
    { label: "Pied de page", expectedCount: 8 },
    { label: "Résumé en 3 colonnes", expectedCount: 9 },
    { label: "Conseils de suivi", expectedCount: 3 },
  ];

  for (const block of newBlocks) {
    test(`« ${block.label} » s'insère en un seul clic et s'annule en un seul Ctrl+Z`, async ({ page }) => {
      const title = `${testTitle} ${block.label}`;
      await createAndOpenDocument(page, title);

      await page.getByRole("button", { name: block.label }).click();
      await page.waitForTimeout(2500);
      expect(await elementCount(title)).toBe(block.expectedCount);

      await page.keyboard.press("Control+z");
      await page.waitForTimeout(2500);
      expect(await elementCount(title)).toBe(0);
    });
  }

  test("« Infos rendez-vous » lie les 4 champs aux vraies variables de rendez-vous", async ({ page }) => {
    const sql = neon(process.env.DATABASE_URL!);
    const title = `${testTitle} Bindings`;
    await createAndOpenDocument(page, title);

    await page.getByRole("button", { name: "Infos rendez-vous" }).click();
    await page.waitForTimeout(2500);

    const [row] = await sql`SELECT "contentJson" FROM "StudioDocument" WHERE title = ${title}`;
    const content = row.contentJson as { pages: { elements: { variableBinding?: string }[] }[] };
    const bindings = content.pages[0].elements.map((element) => element.variableBinding).filter(Boolean);
    expect(bindings.sort()).toEqual(["appointment.date", "appointment.location", "appointment.serviceName", "appointment.start"].sort());
  });
});
