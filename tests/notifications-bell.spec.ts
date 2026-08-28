import { config } from "dotenv";
import { expect, test } from "@playwright/test";

config({ path: ".env.local" });

/**
 * PROMPT-NOTIFICATIONS.md Partie B : la cloche de notifications, montée une
 * seule fois depuis le layout dashboard (DashboardTopBar en desktop,
 * bandeau mobile de la sidebar en dessous de 768px — jamais les deux à la
 * fois, voir §B2 bis).
 */

test.describe("Cloche de notifications", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[type="email"]', "praticien-test@pf-osteo-animale.fr");
    await page.fill('input[type="password"]', "Praticien-Test-2026!");
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard**", { timeout: 10000 });
  });

  test("s'ouvre, se ferme par Échap et rend le focus au bouton", async ({ page }) => {
    const bell = page.locator('button[aria-label^="Notifications"]:visible').first();
    await bell.click();
    await expect(bell).toHaveAttribute("aria-expanded", "true");

    await page.keyboard.press("Escape");
    await expect(bell).toHaveAttribute("aria-expanded", "false");
    await expect(bell).toBeFocused();
  });

  test("le compteur du badge correspond exactement au nombre d'éléments affichés", async ({ page }) => {
    const bell = page.locator('button[aria-label^="Notifications"]:visible').first();
    const badgeText = await bell.locator("span").first().textContent();
    const badgeCount = Number(badgeText);
    await bell.click();
    await page.waitForTimeout(300);

    const rowCount = await page.evaluate(() => {
      const trigger = [...document.querySelectorAll<HTMLButtonElement>('button[aria-haspopup="dialog"]')].find((el) => el.offsetParent !== null);
      const panel = trigger!.parentElement!.querySelector("[aria-labelledby]")!;
      const appointmentRows = panel.querySelectorAll("button.flex.w-full.items-center.gap-3");
      // Les liens de rappel individuels ; exclut le lien de pied "Voir tous les rappels".
      const reminderRows = [...panel.querySelectorAll('a[href="/dashboard/rappels"]')].filter((el) => !el.textContent?.startsWith("Voir"));
      return appointmentRows.length + reminderRows.length;
    });

    expect(rowCount).toBe(badgeCount);
  });

  test("le panneau se ferme lors d'un changement de route", async ({ page }) => {
    const bell = page.locator('button[aria-label^="Notifications"]:visible').first();
    await bell.click();
    await expect(bell).toHaveAttribute("aria-expanded", "true");

    await page.goto("/dashboard/agenda");
    const bellOnAgenda = page.locator('button[aria-label^="Notifications"]:visible').first();
    await expect(bellOnAgenda).toHaveAttribute("aria-expanded", "false");
  });

  for (const path of ["/dashboard/agenda", "/dashboard/clients", "/dashboard/tournees", "/dashboard/rappels", "/dashboard/prestations"]) {
    test(`est présente et fonctionnelle sur ${path}`, async ({ page }) => {
      await page.goto(path);
      const bell = page.locator('button[aria-label^="Notifications"]:visible').first();
      await expect(bell).toBeVisible();
      await bell.click();
      await expect(bell).toHaveAttribute("aria-expanded", "true");
    });
  }

  test("sur /dashboard/carte, le panneau s'affiche au-dessus de la carte Leaflet", async ({ page }) => {
    await page.goto("/dashboard/carte");
    await page.waitForSelector(".leaflet-top");

    const bell = page.locator('button[aria-label^="Notifications"]:visible').first();
    await bell.click();

    const zIndexes = await page.evaluate(() => {
      const trigger = [...document.querySelectorAll<HTMLButtonElement>('button[aria-haspopup="dialog"]')].find((el) => el.offsetParent !== null);
      const panel = trigger?.parentElement?.querySelector("[aria-labelledby]") ?? null;
      const leafletTop = document.querySelector(".leaflet-top");
      return {
        panel: panel ? Number(getComputedStyle(panel).zIndex) : null,
        leafletTop: leafletTop ? Number(getComputedStyle(leafletTop).zIndex) : null,
      };
    });

    expect(zIndexes.panel).not.toBeNull();
    expect(zIndexes.leafletTop).not.toBeNull();
    expect(zIndexes.panel!).toBeGreaterThan(zIndexes.leafletTop!);
  });

  test("à 375px, une seule barre d'en-tête est visible et le panneau ne déborde pas du viewport", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/dashboard");

    // Une seule cloche visible (celle du bandeau mobile), pas de DashboardTopBar en parallèle.
    await expect(page.locator('button[aria-label^="Notifications"]:visible')).toHaveCount(1);

    const bell = page.locator('button[aria-label^="Notifications"]:visible').first();
    await bell.click();

    const overflow = await page.evaluate(() => {
      const trigger = [...document.querySelectorAll<HTMLButtonElement>('button[aria-haspopup="dialog"]')].find((el) => el.offsetParent !== null);
      const panel = trigger!.parentElement!.querySelector("[aria-labelledby]")!;
      const rect = panel.getBoundingClientRect();
      return { left: rect.left, right: rect.right, viewportWidth: window.innerWidth };
    });

    expect(overflow.left).toBeGreaterThanOrEqual(0);
    expect(overflow.right).toBeLessThanOrEqual(overflow.viewportWidth);
  });
});
