import { config } from "dotenv";
import { expect, test, type Page } from "@playwright/test";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.local" });

/**
 * Refonte tournées — étape 2 : structure maître-détail + panneau zones.
 */

const testEmail = "praticien-test@pf-osteo-animale.fr";
const testPassword = "Praticien-Test-2026!";
const tourName = "Tournée E2E Maître-Détail";
const zoneAName = "Zone E2E MD A";
const zoneBName = "Zone E2E MD B";

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

test.describe("Tournées — maître-détail et panneau zones", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(grantPermission);
  test.beforeEach(async ({ page }) => {
    const sql = neon(process.env.DATABASE_URL!);
    await sql`DELETE FROM "RateLimitEvent" WHERE key LIKE 'login:%'`;
    await login(page);
    await page.goto("/dashboard/tournees");
    await page.waitForTimeout(600);
  });
  test.afterAll(cleanup);

  test("sélectionner une tournée affiche son détail (arrêts/zones/départ) et 'Modifier' ouvre le formulaire pré-rempli", async ({ page }) => {
    await page.getByRole("button", { name: /^Zones/ }).click();
    const zonesPanel = page.locator('[role="dialog"][aria-labelledby="zones-panel-title"]');
    await expect(zonesPanel).toBeVisible({ timeout: 10000 });
    await zonesPanel.getByRole("button", { name: "+ Nouvelle zone" }).click();
    let dialog = page.locator('[role="dialog"]').filter({ hasText: "Créer une zone" });
    await dialog.getByPlaceholder("Ex. Zone Le Havre").fill(zoneAName);
    await dialog.getByPlaceholder("Ville").fill("Rouen");
    await dialog.getByPlaceholder("Code postal").fill("76000");
    await dialog.getByRole("button", { name: "Créer la zone" }).click();
    await expect(dialog).toHaveCount(0, { timeout: 10000 });
    await zonesPanel.getByRole("button", { name: "Fermer" }).click();
    await expect(zonesPanel).toHaveCount(0, { timeout: 10000 });

    await page.getByRole("button", { name: "+ Nouvelle tournée", exact: true }).click();
    dialog = page.locator('[role="dialog"]').first();
    await dialog.locator('input[placeholder="Ex. Secteur Dieppe"]').fill(tourName);
    await dialog.getByRole("button", { name: zoneAName, exact: true }).click();
    await dialog.getByRole("button", { name: "Créer la tournée" }).click();
    await expect(dialog).toHaveCount(0, { timeout: 10000 });

    // Apparaît dans la liste de gauche et se sélectionne.
    const listEntry = page.getByRole("button", { name: new RegExp(tourName) });
    await expect(listEntry).toBeVisible({ timeout: 10000 });
    await listEntry.click();

    await expect(page.getByRole("heading", { name: tourName })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(zoneAName, { exact: true })).toBeVisible();
    await expect(page.getByText(/Prochaine occurrence/)).toBeVisible();

    // Modifier réouvre le formulaire avec le nom déjà rempli.
    await page.getByRole("button", { name: "Modifier", exact: true }).click();
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
    await zoneDialog.getByPlaceholder("Ville").fill("Dieppe");
    await zoneDialog.getByPlaceholder("Code postal").fill("76200");
    await zoneDialog.getByRole("button", { name: "Créer la zone" }).click();
    await expect(zoneDialog).toHaveCount(0, { timeout: 10000 });

    // Zone utilisée par une tournée : "Supprimer" doit proposer une réassignation, pas une suppression directe.
    await expect(panel.getByText(zoneAName)).toBeVisible({ timeout: 10000 });
    await panel.locator("li", { hasText: zoneAName }).getByRole("button", { name: "Supprimer" }).click();
    await expect(page.getByText("Réassigner puis supprimer")).toBeVisible({ timeout: 10000 });

    await page.locator("select").last().selectOption({ label: zoneBName });
    await page.getByRole("button", { name: "Réassigner et supprimer" }).click();
    await expect(page.getByText("Réassigner puis supprimer")).toHaveCount(0, { timeout: 10000 });

    // La tournée est désormais rattachée à la nouvelle zone, l'ancienne a disparu.
    await expect(page.getByRole("button", { name: new RegExp(tourName) })).toBeVisible({ timeout: 10000 });
  });
});
