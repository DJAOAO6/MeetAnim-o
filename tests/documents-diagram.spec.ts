import { config } from "dotenv";
import { expect, test } from "@playwright/test";
import { neon } from "./helpers/sql";

config({ path: ".env.local" });

/**
 * Compatibilité de l'ancien schéma animalier (étape 4), remplacé à l'étape 31
 * par le schéma anatomique interactif.
 *
 * Ce type d'élément n'est plus insérable — ces tests ne passent donc plus par
 * l'interface pour en créer un, ils écrivent directement en base un document
 * tel qu'il a pu être enregistré AVANT l'étape 31, et vérifient qu'il
 * s'ouvre, s'affiche et se ré-exporte encore. C'est la promesse de
 * compatibilité faite sur DocumentDiagramElement : aucun document déjà
 * enregistré ne doit se casser.
 */

const testEmail = "praticien-test@pf-osteo-animale.fr";
const testPassword = "Praticien-Test-2026!";
const testTitle = "E2ELegacyDiagramTest";

const legacyContent = {
  formatVersion: 1,
  pageSize: "A4_PORTRAIT",
  pages: [
    {
      id: "page-1",
      elements: [
        {
          id: "diagram-legacy",
          type: "diagram",
          x: 60,
          y: 60,
          width: 380,
          height: 250,
          rotation: 0,
          species: "dog",
          view: "profile-left",
          showLegend: true,
          markers: [
            { id: "marker-1", x: 0.42, y: 0.55, presetId: "restriction", label: "Restriction" },
            { id: "marker-2", x: 0.7, y: 0.3, presetId: "tension", label: "Tension" },
          ],
        },
      ],
    },
  ],
};

async function cleanupDocuments() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`DELETE FROM "StudioDocument" WHERE title LIKE ${testTitle + "%"}`;
}

async function clearLoginRateLimit() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`DELETE FROM "RateLimitEvent" WHERE key LIKE 'login:%'`;
}

/** Crée en base un document tel qu'enregistré avant l'étape 31. */
async function seedLegacyDocument(title: string): Promise<string> {
  const sql = neon(process.env.DATABASE_URL!);
  const [user] = await sql`SELECT id FROM "User" WHERE email = ${testEmail}`;
  const [row] = await sql`
    INSERT INTO "StudioDocument" (id, title, status, "contentJson", "createdByUserId", "createdAt", "updatedAt")
    VALUES (gen_random_uuid()::text, ${title}, 'DRAFT', ${JSON.stringify(legacyContent)}::jsonb, ${user.id}, now(), now())
    RETURNING id`;
  return row.id as string;
}

test.describe("Documents — compatibilité de l'ancien schéma (étape 4 → 31)", () => {
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

  test("un document contenant l'ancien schéma s'ouvre et le conserve intact", async ({ page }) => {
    const title = `${testTitle} Ouverture`;
    const id = await seedLegacyDocument(title);

    await page.goto(`/dashboard/documents/${id}`);
    await page.waitForTimeout(1500);

    // Le panneau Calques le nomme comme un schéma hérité, et ses repères
    // d'origine sont toujours là après ouverture puis enregistrement.
    await page.getByRole("tab", { name: "Calques" }).click();
    await expect(page.getByText("Schéma (ancien)")).toBeVisible();

    const sql = neon(process.env.DATABASE_URL!);
    const [row] = await sql`SELECT "contentJson" FROM "StudioDocument" WHERE id = ${id}`;
    const content = row.contentJson as { pages: { elements: { type: string; markers?: unknown[] }[] }[] };
    const diagram = content.pages[0].elements.find((element) => element.type === "diagram");
    expect(diagram?.markers?.length).toBe(2);
  });

  test("l'ancien schéma n'est plus proposé à l'insertion", async ({ page }) => {
    const title = `${testTitle} Insertion`;
    const id = await seedLegacyDocument(title);

    await page.goto(`/dashboard/documents/${id}`);
    await page.waitForTimeout(1200);
    await page.getByRole("button", { name: "Schémas" }).click();

    await expect(page.getByRole("button", { name: "Schéma (chien)" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Vue latérale gauche" })).toBeVisible();
  });

  test("un document contenant l'ancien schéma s'exporte encore en PDF", async ({ page }) => {
    const title = `${testTitle} Export`;
    const id = await seedLegacyDocument(title);

    await page.goto(`/dashboard/documents/${id}`);
    await page.waitForTimeout(1500);

    await page.getByRole("button", { name: /Finaliser/ }).first().click();
    await page.waitForTimeout(500);
    await page.getByRole("button", { name: /^Finaliser$/ }).last().click();
    await page.waitForTimeout(9000);

    const sql = neon(process.env.DATABASE_URL!);
    const [row] = await sql`SELECT status, length("pdfBase64") AS pdf_len FROM "StudioDocument" WHERE id = ${id}`;
    expect(row.status).toBe("FINALIZED");
    expect(Number(row.pdf_len)).toBeGreaterThan(1000);
  });
});
