import { config } from "dotenv";
import { expect, test, type Page } from "@playwright/test";

config({ path: ".env.local" });

/**
 * Passe responsive large : chaque écran important, à chaque largeur de
 * référence, ne doit produire aucun défilement horizontal involontaire.
 *
 * C'est le garde-fou le moins coûteux et le plus efficace contre les
 * régressions de mise en page : un tableau trop large, une grille au nombre
 * de colonnes figé ou une modale dimensionnée pour un écran large se
 * trahissent tous par un débordement.
 *
 * Les largeurs couvrent les petits téléphones (320), les téléphones courants
 * (375 à 430), les tablettes en portrait et paysage (768 à 1024) et les
 * écrans d'ordinateur (1280, 1440).
 */
const WIDTHS = [320, 375, 390, 430, 768, 820, 1024, 1280, 1440];

/**
 * Le critère est le déplacement réel de la page, pas `scrollWidth` : un
 * contenu volontairement plus large qu'un conteneur à défilement (tableau
 * dense, planning) gonfle `scrollWidth` sans que l'utilisateur puisse pour
 * autant faire glisser l'interface de côté. Ce qui gêne, c'est ce
 * déplacement-là.
 */
async function horizontalScroll(page: Page): Promise<number> {
  return page.evaluate(() => {
    window.scrollTo(9999, window.scrollY);
    const moved = window.scrollX;
    window.scrollTo(0, window.scrollY);
    return Math.round(moved);
  });
}

const PAGES = [
  ["tableau de bord", "/dashboard"],
  ["agenda", "/dashboard/agenda"],
  ["clients", "/dashboard/clients"],
  ["tournées", "/dashboard/tournees"],
  ["rappels", "/dashboard/rappels"],
  ["prestations", "/dashboard/prestations"],
  ["documents", "/dashboard/documents"],
  ["réglages", "/dashboard/parametres"],
] as const;

// 72 chargements de page (8 écrans × 9 largeurs) : le délai par défaut de
// 30 s ne suffit pas, et l'échec porterait alors sur l'horloge plutôt que sur
// la mise en page.
test("aucun débordement horizontal, de 320 à 1440 px", async ({ page }) => {
  test.setTimeout(240_000);
  const failures: string[] = [];

  for (const [label, path] of PAGES) {
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(path, { waitUntil: "networkidle" });
      // Le serveur de développement compile à la demande : mesurer trop tôt
      // revient à mesurer une page à demi stylée, et à signaler des
      // débordements qui n'existent pas.
      await page.waitForTimeout(900);
      const scrolled = await horizontalScroll(page);
      if (scrolled > 1) failures.push(`${label} à ${width}px (défile de ${scrolled}px)`);
    }
  }

  expect(failures, `Débordements :\n${failures.join("\n")}`).toEqual([]);
});

test("la page publique de réservation tient à toutes les largeurs", async ({ page }) => {
  test.setTimeout(120_000);
  const failures: string[] = [];

  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/reserver/pauline-faucillon", { waitUntil: "networkidle" });
    await page.waitForTimeout(900);
    const scrolled = await horizontalScroll(page);
    if (scrolled > 1) failures.push(`page publique à ${width}px (défile de ${scrolled}px)`);
  }

  expect(failures, `Débordements :\n${failures.join("\n")}`).toEqual([]);
});

/**
 * Paramètres sur téléphone : rien de cliquable ne dépasse le bord droit.
 *
 * Le test de défilement ci-dessus ne voit pas ce cas : le tableau de bord
 * coupe ce qui dépasse (`overflow-x-clip`) au lieu de défiler. Un
 * `<fieldset>`, qui refuse par défaut de rétrécir sous la largeur de son
 * contenu, élargissait les cartes à 421 px quel que soit l'écran —
 * « Enregistrer les modifications » finissait en partie hors de l'écran,
 * sans moyen d'y accéder.
 *
 * Ce qui se trouve dans une zone qui défile de côté (la barre d'onglets)
 * reste atteignable : ce n'est pas compté.
 */
test("Paramètres sur mobile : aucun élément interactif ne dépasse le bord droit", async ({ page }) => {
  test.setTimeout(120_000);
  const failures: string[] = [];

  for (const width of [360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/dashboard/parametres", { waitUntil: "networkidle" });
    const tabs = await page.getByRole("navigation", { name: "Onglets des paramètres" }).getByRole("button").allTextContents();
    expect(tabs.length, "des onglets à parcourir").toBeGreaterThan(1);

    for (const tab of tabs) {
      const button = page.getByRole("navigation", { name: "Onglets des paramètres" }).getByRole("button", { name: tab.trim(), exact: true });
      await button.scrollIntoViewIfNeeded();
      await button.click();
      await page.waitForTimeout(500);
      const clipped = await page.evaluate(() => {
        const scrollsSideways = (element: Element) => {
          for (let node = element.parentElement; node; node = node.parentElement) {
            const { overflowX } = getComputedStyle(node);
            if ((overflowX === "auto" || overflowX === "scroll") && node.scrollWidth > node.clientWidth) return true;
          }
          return false;
        };
        return [...document.querySelectorAll<HTMLElement>("main button, main a, main input, main select, main textarea, main [role='switch']")]
          .filter((element) => {
            const box = element.getBoundingClientRect();
            return box.width > 0 && box.height > 0 && box.right > window.innerWidth + 1 && !scrollsSideways(element);
          })
          .map((element) => `${(element.getAttribute("aria-label") || element.textContent || element.getAttribute("name") || element.tagName).trim().slice(0, 40)} (${Math.round(element.getBoundingClientRect().right)} px)`);
      });
      if (clipped.length > 0) failures.push(`${tab.trim()} à ${width}px : ${clipped.slice(0, 5).join(", ")}${clipped.length > 5 ? `… (${clipped.length})` : ""}`);
    }
  }

  expect(failures, `Éléments coupés :\n${failures.join("\n")}`).toEqual([]);
});
