import { config } from "dotenv";
import { expect, test } from "@playwright/test";

config({ path: ".env.local" });

/**
 * Amène automatiquement le bouton "Continuer" à l'écran dès qu'une étape du
 * tunnel de réservation publique est complète (prestation + mode ;
 * date + heure), pour une saisie plus rapide sans défilement manuel —
 * demande explicite du praticien. Fenêtre desktop (BookingActions n'est
 * "sticky" qu'en dessous du palier sm — sur mobile le bouton est déjà
 * toujours visible sans qu'un défilement programmatique soit nécessaire)
 * mais volontairement basse pour que le bouton soit hors champ avant la
 * sélection, sinon l'assertion serait toujours vraie même sans défilement.
 */

const professionalSlug = "pauline-faucillon";

test.describe("Tunnel de réservation publique — défilement automatique vers Continuer", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 480 });
    await page.goto(`/reserver/${professionalSlug}`);
  });

  test("après avoir choisi une prestation puis un mode, le bouton Continuer devient visible sans défilement manuel", async ({ page }) => {
    const continueButton = page.getByRole("button", { name: "Continuer" });
    await expect(continueButton).not.toBeInViewport();

    await page.getByText("Ostéopathie canine").first().click();
    await page.waitForTimeout(200);
    await page.getByText("Au cabinet", { exact: true }).click();
    await page.waitForTimeout(700);

    await expect(continueButton).toBeInViewport();
  });

  test("après avoir choisi une date puis une heure, le bouton Continuer devient visible sans défilement manuel", async ({ page }) => {
    await page.getByText("Ostéopathie canine").first().click();
    await page.getByText("Au cabinet", { exact: true }).click();
    await page.getByRole("button", { name: "Continuer" }).click();
    await page.waitForTimeout(600);

    // Ramène volontairement la page tout en haut après la sélection de date
    // (dont le propre défilement automatique pourrait déjà suffire à révéler
    // "Continuer" sur ce créneau court) : ne garde que l'assertion vraiment
    // utile — qu'un défilement vers l'heure aurait ou non déjà suffi, choisir
    // une heure doit toujours amener "Continuer" à l'écran.
    const firstAvailableDate = page.locator('[role="gridcell"][aria-disabled="false"]').first();
    await firstAvailableDate.click();
    await page.waitForTimeout(700);
    await page.evaluate(() => window.scrollTo(0, 0));

    const continueButton = page.getByRole("button", { name: "Continuer" });
    await expect(continueButton).not.toBeInViewport();

    const firstSlot = page.locator("button", { hasText: /^\d{2}:\d{2}$/ }).first();
    await firstSlot.click();
    await page.waitForTimeout(700);

    await expect(continueButton).toBeInViewport();
  });
});
