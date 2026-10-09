import { config } from "dotenv";
import { expect, test, type Page } from "./helpers/test";
import { neon } from "./helpers/sql";

config({ path: ".env.local" });

/**
 * Carte clients, phase 8.6 : « Mes vues » — enregistrer la carte telle
 * qu'elle est (seul le nom est demandé), revenir à « Tous mes clients »,
 * rouvrir la vue, la supprimer.
 */

const testEmail = "praticien-test@pf-osteo-animale.fr";
const testPassword = "Praticien-Test-2026!";
const VIEW_NAME = "Chiens à revoir E2E";

async function cleanup() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`DELETE FROM "MapView" WHERE name LIKE '%E2E'`;
}

async function login(page: Page) {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`DELETE FROM "RateLimitEvent" WHERE key LIKE 'login:%'`;
  await page.goto("/login");
  await page.fill('input[type="email"]', testEmail);
  await page.fill('input[type="password"]', testPassword);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard**", { timeout: 10000 });
}

const modeButton = (page: Page, name: string) => page.getByRole("tablist", { name: "Mode de la carte" }).getByRole("tab", { name });
const viewsButton = (page: Page) => page.getByRole("button", { expanded: false }).filter({ hasText: /Mes vues|Tous mes clients|E2E/ }).first();

test.describe("Carte clients — vues enregistrées", () => {
  test.beforeAll(cleanup);
  test.afterAll(cleanup);

  test("enregistrer, quitter, rouvrir puis supprimer une vue", async ({ page }) => {
    await login(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/dashboard/carte?mode=relances&suivi=old&especes=Chien", { waitUntil: "networkidle" });
    await expect(modeButton(page, "Relances")).toHaveAttribute("aria-selected", "true");

    await viewsButton(page).click();
    await page.getByRole("group", { name: "Mes vues" }).getByRole("button", { name: "Enregistrer cette vue" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Nom").fill(VIEW_NAME);
    await dialog.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.getByText(`Vue « ${VIEW_NAME} » enregistrée.`)).toBeVisible();
    await expect(viewsButton(page)).toContainText(VIEW_NAME);

    const sql = neon(process.env.DATABASE_URL!);
    const [saved] = await sql`SELECT query FROM "MapView" WHERE name = ${VIEW_NAME}`;
    expect(saved.query).toBe("mode=relances&suivi=old&especes=Chien");

    // Retour à la carte complète.
    await viewsButton(page).click();
    await page.getByRole("group", { name: "Mes vues" }).getByRole("button", { name: "Tous mes clients" }).click();
    await expect(modeButton(page, "Clients")).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("map-species-button")).toHaveText("Espèce");
    await expect.poll(() => new URL(page.url()).search).toBe("");

    // La vue rouverte redonne exactement la carte enregistrée, même après rechargement.
    await page.reload({ waitUntil: "networkidle" });
    await viewsButton(page).click();
    await page.getByRole("group", { name: "Mes vues" }).getByRole("button", { name: VIEW_NAME, exact: true }).click();
    await expect(modeButton(page, "Relances")).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("group", { name: "Suivi des visites" }).getByRole("button", { name: "Plus de 12 mois ou jamais" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("map-species-button")).toHaveText("Chien");

    await viewsButton(page).click();
    await page.getByRole("button", { name: `Supprimer la vue ${VIEW_NAME}` }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Supprimer" }).click();
    await expect(page.getByText(`Vue « ${VIEW_NAME} » supprimée.`)).toBeVisible();
    const remaining = await sql`SELECT id FROM "MapView" WHERE name = ${VIEW_NAME}`;
    expect(remaining).toHaveLength(0);
  });
});
