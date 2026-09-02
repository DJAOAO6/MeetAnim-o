import { config } from "dotenv";
import { expect, test, type Page } from "@playwright/test";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.local" });

/**
 * Zones et tournées récurrentes — Paramètres (unification des tournées,
 * phase 4). Le panneau Zones et TourModal (multi-zone, "Modifier" en
 * dialog) vivent désormais dans Paramètres > Tournées, avec un seul
 * formulaire fusionné (mini-formulaire + TourModal, voir
 * tours-settings-tab.tsx) — plus de maître-détail séparé : la tournée
 * modifiée/créée réapparaît directement dans la liste plate de cet onglet.
 */

const testEmail = "praticien-test@pf-osteo-animale.fr";
const testPassword = "Praticien-Test-2026!";
const tourName = "Tournée E2E Paramètres";
const zoneAName = "Zone E2E Param A";
const zoneBName = "Zone E2E Param B";

async function grantPermission() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`UPDATE "User" SET permissions = ARRAY['MANAGE_PUBLIC_SETTINGS'] WHERE email = ${testEmail}`;
}

async function cleanup() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`DELETE FROM "Tour" WHERE name LIKE ${tourName + "%"}`;
  await sql`DELETE FROM "Zone" WHERE name IN (${zoneAName}, ${zoneBName})`;
}

async function login(page: Page) {
  await page.goto("/login");
  await page.fill('input[type="email"]', testEmail);
  await page.fill('input[type="password"]', testPassword);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard**", { timeout: 10000 });
}

async function openToursSettings(page: Page) {
  await page.goto("/dashboard/parametres");
  await page.getByRole("button", { name: "Tournées", exact: true }).click();
}

test.describe("Paramètres — zones et tournées récurrentes", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(grantPermission);
  test.beforeEach(async ({ page }) => {
    const sql = neon(process.env.DATABASE_URL!);
    await sql`DELETE FROM "RateLimitEvent" WHERE key LIKE 'login:%'`;
    await login(page);
    await openToursSettings(page);
  });
  test.afterAll(cleanup);

  test("créer une zone (recherche de ville) puis une tournée, et la modifier réouvre le formulaire pré-rempli", async ({ page }) => {
    await page.getByRole("button", { name: /^Zones/ }).click();
    const zonesPanel = page.locator('[role="dialog"][aria-labelledby="zones-panel-title"]');
    await expect(zonesPanel).toBeVisible({ timeout: 10000 });
    await zonesPanel.getByRole("button", { name: "+ Nouvelle zone" }).click();

    let dialog = page.locator('[role="dialog"]').filter({ hasText: "Créer une zone" });
    await dialog.getByPlaceholder("Ex. Zone Le Havre").fill(zoneAName);
    // Recherche unifiée (phase 3 quater) : plus de champs "Ville"/"Code
    // postal" en texte libre — une commune choisie renseigne les deux.
    await dialog.getByPlaceholder("Rechercher une ville").fill("Rouen");
    await dialog.getByRole("option", { name: /Rouen/ }).first().click();
    await dialog.getByRole("button", { name: "Créer la zone" }).click();
    await expect(dialog).toHaveCount(0, { timeout: 10000 });
    await expect(zonesPanel.getByText(zoneAName)).toBeVisible({ timeout: 10000 });
    await zonesPanel.getByRole("button", { name: "Fermer" }).click();
    await expect(zonesPanel).toHaveCount(0, { timeout: 10000 });

    await page.getByRole("button", { name: "+ Nouvelle tournée", exact: true }).click();
    dialog = page.locator('[role="dialog"]').first();
    await dialog.locator('input[placeholder="Ex. Secteur Dieppe"]').fill(tourName);
    await dialog.getByRole("button", { name: zoneAName, exact: true }).click();
    await dialog.getByRole("button", { name: "Créer la tournée" }).click();
    await expect(dialog).toHaveCount(0, { timeout: 10000 });

    // Réapparaît directement dans la liste plate (plus de maître-détail) :
    // nom, secteur et rythme sur la même carte.
    const card = page.locator("div.p-5").filter({ hasText: tourName }).last();
    await expect(card).toBeVisible({ timeout: 10000 });
    await expect(card.getByText(new RegExp(zoneAName))).toBeVisible();

    // "Modifier" réouvre le formulaire fusionné (TourModal) avec le nom déjà rempli.
    await card.getByRole("button", { name: "Modifier", exact: true }).click();
    dialog = page.locator('[role="dialog"]').first();
    await expect(dialog.locator('input[value="' + tourName + '"]')).toBeVisible({ timeout: 10000 });
    await dialog.getByRole("button", { name: "Annuler" }).click();
  });

  test("le panneau Zones affiche le nombre de tournées par zone et bloque la suppression directe d'une zone utilisée", async ({ page }) => {
    await page.getByRole("button", { name: /^Zones/ }).click();
    const panel = page.locator('[role="dialog"][aria-labelledby="zones-panel-title"]');
    await expect(panel).toBeVisible({ timeout: 10000 });
    await expect(panel.getByText(zoneAName)).toBeVisible();
    // Scopé à la ligne de cette zone précise — sans ça, une autre zone
    // réelle de l'environnement affichant elle aussi "1 tournée" rend le
    // texte ambigu dans tout le panneau (violation strict mode Playwright).
    await expect(panel.locator("li", { hasText: zoneAName }).getByText("1 tournée", { exact: false })).toBeVisible();

    // Créer une deuxième zone directement depuis le panneau, sans quitter l'écran.
    await panel.getByRole("button", { name: "+ Nouvelle zone" }).click();
    const zoneDialog = page.locator('[role="dialog"]').filter({ hasText: "Créer une zone" });
    await zoneDialog.getByPlaceholder("Ex. Zone Le Havre").fill(zoneBName);
    await zoneDialog.getByPlaceholder("Rechercher une ville").fill("Dieppe");
    await zoneDialog.getByRole("option", { name: /Dieppe/ }).first().click();
    await zoneDialog.getByRole("button", { name: "Créer la zone" }).click();
    await expect(zoneDialog).toHaveCount(0, { timeout: 10000 });

    // Zone utilisée par une tournée : "Supprimer" doit proposer une réassignation, pas une suppression directe.
    await expect(panel.getByText(zoneAName)).toBeVisible({ timeout: 10000 });
    await panel.locator("li", { hasText: zoneAName }).getByRole("button", { name: "Supprimer" }).click();
    await expect(page.getByText("Réassigner puis supprimer")).toBeVisible({ timeout: 10000 });

    await page.locator("select").last().selectOption({ label: zoneBName });
    await page.getByRole("button", { name: "Réassigner et supprimer" }).click();
    await expect(page.getByText("Réassigner puis supprimer")).toHaveCount(0, { timeout: 10000 });
    await panel.getByRole("button", { name: "Fermer" }).click();

    // La tournée est désormais rattachée à la nouvelle zone, l'ancienne a disparu.
    const card = page.locator("div.p-5").filter({ hasText: tourName }).last();
    await expect(card.getByText(new RegExp(zoneBName))).toBeVisible({ timeout: 10000 });
  });
});
