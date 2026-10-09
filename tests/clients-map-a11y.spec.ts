import { expect, test, type Page } from "./helpers/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Carte clients, phase 9 : passe qualité — aucune violation d'accessibilité
 * sérieuse dans les quatre modes et fiche ouverte, pas de défilement
 * horizontal aux largeurs de référence, et mode sombre appliqué aux fiches
 * de la carte. Session ouverte par le projet « setup ».
 */

async function seriousViolations(page: Page) {
  // Les tuiles et les marqueurs de Leaflet sont exclus : images décoratives
  // du fond de carte et icônes dont le titre porte déjà l'information.
  const results = await new AxeBuilder({ page }).exclude(".leaflet-tile-pane").exclude(".leaflet-marker-pane").analyze();
  return results.violations
    .filter((violation) => violation.impact === "critical" || violation.impact === "serious")
    .map((violation) => ({ id: violation.id, nodes: violation.nodes.map((node) => `${node.target.join(" ")} — ${node.failureSummary?.split("\n")[1]?.trim() ?? ""}`) }));
}

test("les quatre modes de la carte, et une fiche ouverte, restent accessibles", async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const mode of ["", "?mode=activite&periode=30", "?mode=relances", "?mode=tournees"]) {
    await page.goto(`/dashboard/carte${mode}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    expect(await seriousViolations(page), `carte${mode}`).toEqual([]);
  }
  await page.goto("/dashboard/carte", { waitUntil: "networkidle" });
  await page.locator("[data-client-row]").first().getByRole("button").first().click();
  await expect(page.getByRole("link", { name: "Voir la fiche client" })).toBeVisible();
  expect(await seriousViolations(page), "fiche ouverte").toEqual([]);
});

test("pas de défilement horizontal aux largeurs de référence", async ({ page }) => {
  test.setTimeout(120000);
  for (const width of [1440, 1024, 800, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/dashboard/carte", { waitUntil: "networkidle" });
    await page.waitForTimeout(600);
    const { scrollWidth, innerWidth } = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }));
    expect(scrollWidth, `débordement à ${width} px`).toBeLessThanOrEqual(innerWidth + 1);
  }
});

test("mode sombre : les fiches de la carte prennent la surface du thème", async ({ page }) => {
  // Le thème du tableau de bord est une préférence d'affichage du navigateur.
  await page.addInitScript(() => window.localStorage.setItem("1002pattes-dashboard-theme-v2", JSON.stringify({ mode: "dark" })));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/dashboard/carte", { waitUntil: "networkidle" });
  await expect(page.locator('[data-dashboard-theme][data-theme="dark"]')).toHaveCount(1);
  await page.locator("[data-client-row]").first().getByRole("button").first().click();
  const card = page.getByRole("button", { name: /^Fermer la fiche de/ }).locator("xpath=ancestor::div[contains(@class,'rounded-2xl')][1]");
  const background = await card.evaluate((element) => getComputedStyle(element).backgroundColor);
  const [red, green, blue] = background.match(/[\d.]+/g)!.map(Number);
  expect(red + green + blue, `fond sombre attendu, reçu ${background}`).toBeLessThan(3 * 128);
  expect(await seriousViolations(page), "mode sombre").toEqual([]);
});
