import { expect, test, type Page } from "./helpers/test";

/**
 * Empilement du tableau de bord : le contenu des pages (isolé dans <main>)
 * ne passe jamais au-dessus du menu latéral, et les fenêtres superposées
 * (sorties de <main> par un portail) passent toujours au-dessus de tout.
 */

/** Ce qui se trouve réellement sous le point (x, y). */
async function topmost(page: Page, x: number, y: number) {
  return page.evaluate(([px, py]) => {
    const element = document.elementFromPoint(px, py);
    if (!element) return "rien";
    if (element.closest("[role='dialog'], [role='presentation']")) return "fenêtre";
    if (element.closest("aside")) return "menu latéral";
    if (element.closest("nav[aria-label='Navigation principale (mobile)']")) return "barre du bas";
    if (element.closest("main")) return "page";
    return element.tagName.toLowerCase();
  }, [x, y]);
}

test("à 800 px, le menu déplié au survol passe au-dessus de la recherche de la carte", async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 900 });
  await page.goto("/dashboard/carte", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Réduire le menu" }).click();
  const aside = page.locator("aside.dashboard-sidebar");
  const collapsed = (await aside.boundingBox())!;
  await page.mouse.move(collapsed.x + collapsed.width / 2, collapsed.y + 320);
  await expect.poll(async () => (await aside.boundingBox())!.width, { message: "le menu se déplie au survol" }).toBeGreaterThan(200);

  const search = (await page.getByPlaceholder("Rechercher un client, un animal ou un lieu").boundingBox())!;
  const expanded = (await aside.boundingBox())!;
  // Un point de la recherche recouvert par le menu déplié.
  const x = Math.min(expanded.x + expanded.width - 16, search.x + 24);
  expect(x, "la recherche passe bien sous la zone du menu").toBeGreaterThan(search.x);
  expect(await topmost(page, x, search.y + search.height / 2)).toBe("menu latéral");
});

test("une fenêtre ouverte depuis la page passe au-dessus du menu latéral", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/dashboard/agenda", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Nouveau rendez-vous" }).first().click();
  await expect(page.getByRole("dialog").first()).toBeVisible();
  const aside = (await page.locator("aside.dashboard-sidebar").boundingBox())!;
  expect(await topmost(page, aside.x + aside.width / 2, aside.y + 300)).toBe("fenêtre");
});

test("sur téléphone, une fenêtre passe au-dessus de la barre du bas", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dashboard/agenda", { waitUntil: "networkidle" });
  // Sur téléphone, l'ajout passe par le « + » flottant, puis sa feuille.
  await page.getByRole("button", { name: "Ajouter à l’agenda" }).click();
  await page.getByRole("menuitem", { name: "Nouveau rendez-vous" }).click();
  await expect(page.getByRole("dialog", { name: "Nouveau rendez-vous" })).toBeVisible();
  const nav = (await page.getByRole("navigation", { name: "Navigation principale (mobile)" }).boundingBox())!;
  expect(await topmost(page, nav.x + nav.width / 2, nav.y + nav.height / 2)).toBe("fenêtre");
});
