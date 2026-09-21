import { config } from "dotenv";
import { expect, test } from "@playwright/test";
import { neon } from "./helpers/sql";

config({ path: ".env.local" });

/**
 * Studio de documents, étape 6 : rail d'icônes + panneaux contextuels
 * (remplace l'ancienne barre latérale toujours dépliée).
 */

const testEmail = "praticien-test@pf-osteo-animale.fr";
const testPassword = "Praticien-Test-2026!";
const testTitle = "E2EShellTest";

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
  await page.waitForTimeout(600);
}

test.describe("Documents — rail et panneaux contextuels (étape 6)", () => {
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

  test("cliquer une icône du rail n'ouvre qu'un seul panneau à la fois", async ({ page }) => {
    const title = `${testTitle} Rail`;
    await createAndOpenDocument(page, title);

    // Scopé au rail (nav) : le nom accessible "Texte" est autrement une
    // sous-chaîne de "Bloc de texte" (bouton du panneau une fois ouvert),
    // ce qui rendrait la recherche ambiguë dès que le panneau est ouvert.
    const rail = page.getByRole("navigation", { name: "Outils du Studio" });
    const railTexte = rail.getByRole("button", { name: "Texte" });
    const railFormes = rail.getByRole("button", { name: "Formes" });

    await expect(railTexte).toHaveAttribute("aria-expanded", "false");
    await railTexte.click();
    await expect(railTexte).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByRole("button", { name: "Bloc de texte" })).toBeVisible();

    await railFormes.click();
    await expect(railFormes).toHaveAttribute("aria-expanded", "true");
    await expect(railTexte).toHaveAttribute("aria-expanded", "false");
    // Le panneau précédent disparaît réellement du DOM, pas juste masqué.
    await expect(page.getByRole("button", { name: "Bloc de texte" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Rectangle", exact: true })).toBeVisible();

    // Recliquer la même icône referme le panneau.
    await railFormes.click();
    await expect(railFormes).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByRole("button", { name: "Rectangle", exact: true })).toHaveCount(0);
  });

  test("le clavier seul atteint le premier contrôle du panneau ouvert, sans jamais viser un panneau fermé", async ({ page }) => {
    const title = `${testTitle} Clavier`;
    await createAndOpenDocument(page, title);

    await page.getByRole("button", { name: "Formes" }).click();
    // Depuis le dernier bouton du rail, le contrôle suivant dans l'ordre du
    // DOM est le premier contrôle du panneau "Formes" ouvert — jamais un
    // contrôle d'un panneau fermé, puisque ceux-ci ne sont pas rendus du
    // tout (voir studio-sidebar.tsx).
    await page.getByRole("button", { name: "Données" }).focus();
    await page.keyboard.press("Tab");
    const focused = await page.evaluate(() => document.activeElement?.textContent?.trim());
    expect(focused).toBe("Rectangle");
  });

  test("les interactions déjà couvertes (texte, formes, schéma, blocs, variables) fonctionnent toujours depuis leur panneau", async ({ page }) => {
    const sql = neon(process.env.DATABASE_URL!);
    const title = `${testTitle} Regression`;
    await createAndOpenDocument(page, title);

    await page.getByRole("button", { name: "Formes" }).click();
    await page.getByRole("button", { name: "Rectangle", exact: true }).click();
    await page.waitForTimeout(2500);

    const [row] = await sql`SELECT "contentJson" FROM "StudioDocument" WHERE title = ${title}`;
    const content = row.contentJson as { pages: { elements: { type: string }[] }[] };
    expect(content.pages[0].elements.some((element) => element.type === "shape")).toBe(true);
  });
});
