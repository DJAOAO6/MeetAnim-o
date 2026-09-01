import { config } from "dotenv";
import { expect, test } from "@playwright/test";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.local" });

/**
 * Réglages > Tournées — section "Lieux favoris" et "Éditeur de tournées —
 * réglages par défaut" (TourPreferences/SavedPlace), ajoutées à côté de la
 * gestion existante des tournées récurrentes par zone.
 */

const testEmail = "praticien-test@pf-osteo-animale.fr";
const testPassword = "Praticien-Test-2026!";
const testPlaceLabel = "Écurie de Test E2E";

async function clearLoginRateLimit() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`DELETE FROM "RateLimitEvent" WHERE key LIKE 'login:%'`;
}

async function cleanupSavedPlace() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`DELETE FROM "SavedPlace" WHERE label = ${testPlaceLabel}`;
}

test.describe("Réglages — Tournées (favoris et préférences)", () => {
  test.beforeEach(clearLoginRateLimit);
  test.afterEach(cleanupSavedPlace);

  test("affiche les sections, ajoute puis supprime un lieu favori, bascule un réglage", async ({ page }) => {
    await cleanupSavedPlace();

    await page.goto("/login");
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', testPassword);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard**", { timeout: 10000 });

    await page.goto("/dashboard/parametres");
    // Le contenu des onglets s'hydrate après le rendu SSR initial (même
    // convention que le reste de la suite, ex. public-booking-flow.spec.ts) :
    // sans cette pause, le clic peut arriver avant que le gestionnaire React
    // soit attaché.
    await page.waitForTimeout(600);
    await page.getByRole("button", { name: "Tournées", exact: true }).click();

    await expect(page.getByText("Lieux favoris")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Éditeur de tournées — réglages par défaut")).toBeVisible();

    // Ajout d'un lieu favori.
    await page.getByRole("button", { name: "+ Ajouter un lieu" }).click();
    await page.locator("label", { hasText: "Nom" }).locator("input").fill(testPlaceLabel);
    const addressInput = page.locator("label", { hasText: "Adresse" }).locator("input");
    await addressInput.fill("1 place de l'Hôtel de Ville, Rouen");
    await page.waitForTimeout(600);
    const firstSuggestion = page.getByRole("listbox", { name: "Suggestions d’adresse" }).getByRole("option").first();
    await expect(firstSuggestion).toBeVisible({ timeout: 10000 });
    await firstSuggestion.click();
    await page.getByRole("button", { name: "Ajouter", exact: true }).click();

    await expect(page.getByText(testPlaceLabel)).toBeVisible({ timeout: 10000 });

    // Bascule d'un réglage (pause déjeuner) — vérifie juste l'absence d'erreur.
    await page.getByRole("switch", { name: "Pause déjeuner" }).click();
    await expect(page.locator('input[type="time"]').first()).toBeVisible({ timeout: 5000 });

    // Suppression du lieu ajouté.
    await page.getByText(testPlaceLabel).locator("..").locator("..").getByRole("button", { name: "Supprimer" }).click();
    await expect(page.getByText(testPlaceLabel)).toHaveCount(0, { timeout: 10000 });
  });
});
