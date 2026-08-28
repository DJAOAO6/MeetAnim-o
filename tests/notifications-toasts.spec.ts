import { config } from "dotenv";
import { expect, test } from "@playwright/test";

config({ path: ".env.local" });

/**
 * PROMPT-NOTIFICATIONS.md Partie A : vérifie le système de toasts unifié
 * (src/lib/notify.ts + Sonner monté une seule fois dans le layout dashboard).
 * Les scénarios s'appuient sur des actions réelles de l'UI (comme le reste
 * de la suite E2E) plutôt que d'appeler notify.* directement, afin de tester
 * le comportement effectivement vu par l'utilisateur.
 */

test.describe("Système de notifications (toasts)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[type="email"]', "praticien-test@pf-osteo-animale.fr");
    await page.fill('input[type="password"]', "Praticien-Test-2026!");
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard**", { timeout: 10000 });
  });

  test("un toast de succès disparaît automatiquement après ~4s", async ({ page }) => {
    // Création de zone : action purement locale (pas d'écriture en base),
    // donc aucun nettoyage nécessaire après le test.
    await page.goto("/dashboard/tournees");
    await page.getByRole("button", { name: "Nouvelle zone" }).click();
    const dialog = page.locator('[role="dialog"]').first();
    await dialog.getByPlaceholder("Ex. Zone Le Havre").fill("Zone E2E Toast");
    await dialog.getByPlaceholder("Ville").fill("Yvetot");
    await dialog.getByPlaceholder("Code postal").fill("76190");
    await dialog.getByRole("button", { name: "Créer la zone" }).click();

    const toast = page.locator('[data-sonner-toast][data-type="success"]');
    await expect(toast).toBeVisible();
    await expect(toast).toContainText("Zone E2E Toast a été créée localement.");

    // Toujours présent juste avant l'échéance des 4s...
    await page.waitForTimeout(3500);
    await expect(toast).toBeVisible();

    // ...disparu après.
    await page.waitForTimeout(1500);
    await expect(toast).toHaveCount(0);
  });

  test("un toast d'erreur reste affiché jusqu'à fermeture manuelle", async ({ page }) => {
    // Zone Dieppe est utilisée par la tournée Dieppe des données de démo :
    // sa suppression est rejetée côté client, ce qui déclenche notify.error.
    await page.goto("/dashboard/tournees");
    await page.locator('button:has-text("Supprimer")').first().click();

    const toast = page.locator('[data-sonner-toast][data-type="error"]');
    await expect(toast).toBeVisible();
    await expect(toast).toContainText("ne peut pas être supprimée");

    // Toujours là bien après la durée d'auto-dismiss des succès (4s).
    await page.waitForTimeout(5000);
    await expect(toast).toBeVisible();

    await toast.getByRole("button", { name: "Close toast" }).click();
    await expect(toast).toHaveCount(0);
  });

  test("plusieurs actions rapides empilent les toasts sans perte", async ({ page }) => {
    await page.goto("/dashboard/tournees");
    await page.getByText("Voir la journée").first().click();
    const routeButton = page.getByRole("button", { name: "Voir l’itinéraire" });

    // Trois déclenchements rapprochés du même toast info (simulation de
    // l'itinéraire) : chacun doit produire son propre toast, aucun perdu.
    await routeButton.click();
    await routeButton.click();
    await routeButton.click();

    await expect(page.locator('[data-sonner-toast][data-type="info"]')).toHaveCount(3);
  });

  test("le toast est annoncé aux technologies d'assistance via une région live", async ({ page }) => {
    await page.goto("/dashboard/tournees");
    await page.getByText("Voir la journée").first().click();
    await page.getByRole("button", { name: "Voir l’itinéraire" }).click();

    const liveRegion = page.locator('[aria-live="polite"]').filter({ has: page.locator('[data-sonner-toast]') });
    await expect(liveRegion).toHaveCount(1);
    await expect(liveRegion.locator('[data-sonner-toast]')).toContainText("simulation locale");
  });
});
