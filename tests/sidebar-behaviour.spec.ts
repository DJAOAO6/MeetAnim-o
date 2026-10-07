import { config } from "dotenv";
import { expect, test, type Page } from "@playwright/test";

config({ path: ".env.local" });

/**
 * Comportement de la navigation : la barre réduite s'ouvre au survol ou
 * seulement au bouton, selon le réglage.
 *
 * La vérification qui compte est celle-ci : le survol déplie la barre
 * **par-dessus** le contenu, donc ni la position ni la largeur du contenu ne
 * doivent bouger d'un pixel. Un vrai repli, lui, doit au contraire les faire
 * changer — c'est toute la différence entre les deux gestes.
 */
type Behaviour = "Automatique au survol" | "Manuelle au clic";

async function contentBox(page: Page) {
  return page.evaluate(() => {
    const main = document.querySelector("main")!.getBoundingClientRect();
    const aside = document.querySelector("aside")!.getBoundingClientRect();
    return { left: Math.round(main.left), width: Math.round(main.width), asideWidth: Math.round(aside.width) };
  });
}

function settingsSection(page: Page, label: string) {
  return page.getByRole("navigation", { name: "Sections de personnalisation" }).getByRole("button", { name: new RegExp(`^${label}`) });
}

function segmented(page: Page, group: string, choice: string) {
  return page.getByRole("group", { name: group }).getByRole("button", { name: choice });
}

async function openNavigationSettings(page: Page) {
  await page.goto("/dashboard/parametres?tab=customization", { waitUntil: "networkidle" });
  await settingsSection(page, "Navigation").click();
  await expect(page.getByRole("heading", { name: "Comportement de la navigation" })).toBeVisible();
}

async function setBehaviour(page: Page, sidebar: Behaviour) {
  await openNavigationSettings(page);
  await segmented(page, "Ouverture de la barre latérale", sidebar).click();
}

test("le survol déplie la barre sans déplacer le contenu", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await setBehaviour(page, "Automatique au survol");

  await page.goto("/dashboard", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Réduire le menu" }).click();
  await page.waitForTimeout(500);

  const collapsed = await contentBox(page);
  expect(collapsed.asideWidth, "la barre doit se réduire").toBeLessThan(90);

  // Survol : la barre reprend sa largeur, le contenu reste immobile.
  await page.locator("aside").hover();
  await page.waitForTimeout(500);
  const hovered = await contentBox(page);
  expect(hovered.asideWidth, "la barre doit se déplier au survol").toBeGreaterThan(200);
  expect(hovered.left, "le contenu ne doit pas se déplacer").toBe(collapsed.left);
  expect(hovered.width, "le contenu ne doit pas changer de largeur").toBe(collapsed.width);
  await expect(page.getByRole("navigation", { name: "Navigation principale" }).getByText("Planning", { exact: true })).toBeVisible();

  // La souris s'éloigne : repli après le délai de tolérance.
  await page.mouse.move(1200, 500);
  await page.waitForTimeout(800);
  expect((await contentBox(page)).asideWidth, "la barre doit se replier quand la souris part").toBeLessThan(90);

  // Bouton depuis l'état survolé : la barre s'ouvre pour de bon, et là, le
  // contenu se décale.
  await page.locator("aside").hover();
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: "Déployer le menu" }).click();
  await page.waitForTimeout(500);
  const expanded = await contentBox(page);
  expect(expanded.asideWidth).toBeGreaterThan(200);
  expect(expanded.left, "une vraie ouverture décale le contenu").toBeGreaterThan(collapsed.left);

  await page.mouse.move(1200, 500);
  await page.waitForTimeout(800);
  expect((await contentBox(page)).asideWidth, "une barre ouverte au bouton ne se referme pas toute seule").toBeGreaterThan(200);
});

test("barre en manuel : le survol ne déplie rien", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await setBehaviour(page, "Manuelle au clic");

  await page.goto("/dashboard", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Réduire le menu" }).click();
  await page.waitForTimeout(500);

  await page.locator("aside").hover();
  await page.waitForTimeout(700);
  expect((await contentBox(page)).asideWidth, "en manuel, le survol ne doit rien changer").toBeLessThan(90);

  await page.getByRole("button", { name: "Déployer le menu" }).click();
  await page.waitForTimeout(500);
  expect((await contentBox(page)).asideWidth).toBeGreaterThan(200);
});

test("le réglage d'ouverture des catégories a disparu, et son ancienne valeur est ignorée", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  // Un navigateur qui a gardé l'ancien réglage.
  await page.goto("/dashboard", { waitUntil: "networkidle" });
  await page.evaluate(() => localStorage.setItem("1002pattes.sidebar.preferences", JSON.stringify({ sidebarBehavior: "click", menuBehavior: "click", defaultState: "expanded" })));

  await openNavigationSettings(page);
  await expect(page.getByRole("group", { name: "Ouverture des menus" })).toHaveCount(0);
  // Les réglages qui restent sont repris tels quels.
  await expect(segmented(page, "Ouverture de la barre latérale", "Manuelle au clic")).toHaveAttribute("aria-pressed", "true");

  // Au premier changement, l'ancienne valeur quitte le stockage.
  await segmented(page, "Ouverture de la barre latérale", "Automatique au survol").click();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("1002pattes.sidebar.preferences") ?? "{}"));
  expect(stored).toEqual({ sidebarBehavior: "hover", defaultState: "expanded" });
});

test("les réglages survivent au rechargement et suivent le bouton de la barre", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await setBehaviour(page, "Manuelle au clic");

  await page.reload({ waitUntil: "networkidle" });
  await settingsSection(page, "Navigation").click();
  await expect(segmented(page, "Ouverture de la barre latérale", "Manuelle au clic")).toHaveAttribute("aria-pressed", "true");

  // Le bouton de la barre et le réglage décrivent le même état : ils doivent
  // rester d'accord, quel que soit celui des deux qu'on manipule.
  await expect(segmented(page, "État de la barre latérale", "Ouverte")).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Réduire le menu" }).click();
  await expect(segmented(page, "État de la barre latérale", "Réduite")).toHaveAttribute("aria-pressed", "true");

  await segmented(page, "État de la barre latérale", "Ouverte").click();
  await page.waitForTimeout(400);
  await expect(page.getByRole("button", { name: "Réduire le menu" })).toBeVisible();

  // Remise au comportement par défaut pour ne pas influencer les autres specs.
  await setBehaviour(page, "Automatique au survol");
});
