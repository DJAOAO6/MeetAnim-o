import { expect, test, type Page } from "@playwright/test";

/**
 * Agenda sur tablette et téléphone : colonnes jamais écrasées (la grille
 * défile dans sa carte, l'axe des heures et l'en-tête suivent), navigation
 * jour par jour à portée de pouce, cibles de 44 px.
 */
async function pageOverflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}

test("tablette : la semaine défile dans sa carte, heures et en-tête suivent", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1000 });
  await page.goto("/dashboard/agenda", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Semaine", exact: true }).click();
  const scroller = page.getByTestId("agenda-grid-scroller");
  await scroller.scrollIntoViewIfNeeded();
  expect(await pageOverflow(page), "la page elle-même ne déborde pas").toBeLessThanOrEqual(0);

  const widths = await page.getByTestId("agenda-slot-layer").evaluateAll((layers) => layers.map((layer) => layer.getBoundingClientRect().width));
  expect(widths.length).toBe(7);
  for (const width of widths) expect(width, "une colonne lisible").toBeGreaterThanOrEqual(88);
  expect(await scroller.evaluate((el) => el.scrollWidth > el.clientWidth), "la grille défile latéralement").toBe(true);

  await scroller.evaluate((el) => { el.scrollLeft = 0; el.dispatchEvent(new Event("scroll")); });
  const timeBefore = (await page.getByTestId("agenda-time-column").boundingBox())!.x;
  await scroller.evaluate((el) => { el.scrollLeft = 120; el.dispatchEvent(new Event("scroll")); });
  await page.waitForTimeout(50);
  const timeAfter = (await page.getByTestId("agenda-time-column").boundingBox())!.x;
  expect(Math.abs(timeAfter - timeBefore), "l'axe des heures reste en place").toBeLessThan(1);

  // Chaque jour de l'en-tête reste aligné sur sa colonne.
  const headings = await page.getByTestId("agenda-day-heading").evaluateAll((cells) => cells.map((cell) => cell.getBoundingClientRect().x));
  const columns = await page.getByTestId("agenda-slot-layer").evaluateAll((layers) => layers.map((layer) => layer.getBoundingClientRect().x));
  headings.forEach((x, index) => expect(Math.abs(x - columns[index]), `jour ${index + 1} aligné`).toBeLessThan(6));
});

test("bureau : la semaine tient sans défilement latéral", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/dashboard/agenda", { waitUntil: "networkidle" });
  const scroller = page.getByTestId("agenda-grid-scroller");
  expect(await scroller.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
});

test("téléphone : vue Jour, on passe d'un jour à l'autre depuis l'en-tête", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dashboard/agenda", { waitUntil: "networkidle" });
  const strip = page.getByTestId("agenda-day-strip");
  await expect(strip).toBeVisible();
  expect(await pageOverflow(page)).toBeLessThanOrEqual(0);

  const current = strip.locator("[aria-current='date']");
  const before = await current.textContent();
  await strip.getByRole("button", { name: "Jour suivant" }).click();
  await expect(current).not.toHaveText(before!);
  await strip.getByRole("button", { name: /^Afficher / }).first().click();
  await expect(current).toHaveText(before!);

  // Cibles tactiles : 44 px au moins.
  for (const target of [strip.getByRole("button", { name: "Jour précédent" }), strip.getByRole("button", { name: "Jour suivant" }), page.getByRole("button", { name: "Aujourd’hui" }), page.getByRole("button", { name: "Semaine", exact: true })]) {
    const box = (await target.boundingBox())!;
    expect(box.height, "cible de 44 px").toBeGreaterThanOrEqual(44);
  }
});
