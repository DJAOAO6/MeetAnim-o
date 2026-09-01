import { config } from "dotenv";
import { expect, test, type Page } from "@playwright/test";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.local" });

/**
 * Le dropdown de recherche unifiée (carte clients) doit passer AU-DESSUS
 * des contrôles de zoom Leaflet (z-index: 1000 par défaut sur
 * .leaflet-top/.leaflet-bottom) — voir .leaflet-container { isolation:
 * isolate } dans globals.css, et le z-50 sur le wrapper de UnifiedSearch.
 */

const testEmail = "praticien-test@pf-osteo-animale.fr";
const testPassword = "Praticien-Test-2026!";

async function clearLoginRateLimit() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`DELETE FROM "RateLimitEvent" WHERE key LIKE 'login:%'`;
}

async function login(page: Page) {
  await page.goto("/login");
  await page.fill('input[type="email"]', testEmail);
  await page.fill('input[type="password"]', testPassword);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard**", { timeout: 10000 });
}

test.describe("Carte clients — dropdown de recherche au-dessus des contrôles de zoom", () => {
  test.beforeEach(clearLoginRateLimit);

  test("le dropdown recouvre les boutons +/- Leaflet, et le zoom reste cliquable une fois fermé", async ({ page }) => {
    await login(page);
    await page.goto("/dashboard/carte");
    await page.waitForTimeout(600);

    const zoomIn = page.locator(".leaflet-control-zoom-in");
    await expect(zoomIn).toBeVisible({ timeout: 10000 });

    const searchInput = page.getByRole("combobox");
    await searchInput.fill("Ro"); // déclenche la recherche de lieux (>= 2 caractères)
    await page.waitForTimeout(500);

    const listbox = page.getByRole("listbox", { name: "Résultats de recherche" });
    await expect(listbox).toBeVisible({ timeout: 10000 });

    // Le point central du bouton zoom doit désormais résoudre vers un
    // élément situé DANS le dropdown, pas vers le contrôle Leaflet.
    const zoomBox = await zoomIn.boundingBox();
    expect(zoomBox).not.toBeNull();
    const elementAtZoomPoint = await page.evaluate(({ x, y }) => {
      const el = document.elementFromPoint(x, y);
      return el?.closest('[role="listbox"]') !== null;
    }, { x: zoomBox!.x + zoomBox!.width / 2, y: zoomBox!.y + zoomBox!.height / 2 });
    expect(elementAtZoomPoint).toBe(true);

    // Fermeture du dropdown, puis le zoom doit rester réellement cliquable
    // (Playwright échoue lui-même si un overlay invisible intercepte le clic).
    await page.keyboard.press("Escape");
    await expect(listbox).toHaveCount(0);
    await zoomIn.click({ timeout: 5000 });
  });
});
