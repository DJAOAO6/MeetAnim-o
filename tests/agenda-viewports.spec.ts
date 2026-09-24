import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/**
 * L'agenda sur les huit largeurs de référence, du grand écran au petit
 * téléphone : rien ne déborde, la grille reste lisible, l'en-tête des jours
 * reste collé, les actions principales sont à l'écran, et axe ne relève
 * aucune violation WCAG A/AA.
 */
const VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 1440, height: 900 },
  { width: 1366, height: 768 },
  { width: 1024, height: 768 },
  { width: 768, height: 1024 },
  { width: 430, height: 932 },
  { width: 390, height: 844 },
  { width: 375, height: 667 },
];

for (const viewport of VIEWPORTS) {
  test(`agenda à ${viewport.width} px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/dashboard/agenda", { waitUntil: "networkidle" });
    const phone = viewport.width < 768;
    const region = page.getByRole("region", { name: phone ? "Planning du jour" : "Planning de la semaine" });
    await expect(region, phone ? "vue Jour sur téléphone" : "vue Semaine au-delà").toBeVisible();

    // Rien ne déborde de la page.
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);

    // Les actions principales sont entières à l'écran.
    for (const name of [/^Nouveau (rendez-vous|RDV)$/, /^Bloquer( un créneau)?$/, /^Affichage$/]) {
      const button = page.getByRole("button", { name }).first();
      await button.scrollIntoViewIfNeeded();
      const box = (await button.boundingBox())!;
      expect(box.x, `${name} visible`).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, `${name} entier`).toBeLessThanOrEqual(viewport.width);
    }

    // Colonnes lisibles.
    const widths = await page.getByTestId("agenda-slot-layer").evaluateAll((layers) => layers.map((layer) => layer.getBoundingClientRect().width));
    for (const width of widths) expect(width).toBeGreaterThanOrEqual(88);

    // L'en-tête des jours reste en haut quand la page défile.
    const header = page.getByTestId("agenda-day-header");
    await header.evaluate((el) => el.scrollIntoView({ block: "start" }));
    await page.evaluate(() => window.scrollBy(0, 300));
    await page.waitForTimeout(150);
    const top = (await header.boundingBox())!.y;
    expect(top, "en-tête collé").toBeGreaterThanOrEqual(-1);
    expect(top, "en-tête collé").toBeLessThanOrEqual(80);

    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(results.violations.map((violation) => `${violation.id} (${violation.nodes.length})`)).toEqual([]);
  });
}
