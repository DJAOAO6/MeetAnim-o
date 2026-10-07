import { config } from "dotenv";
import { expect, test, type Page } from "@playwright/test";

config({ path: ".env.local" });

/**
 * Navigation latérale rétractable. Le point sensible n'est pas la barre
 * elle-même mais ce qu'elle entraîne : quand elle se replie, le contenu doit
 * récupérer l'espace, sans bande vide, sans recouvrement et sans provoquer de
 * défilement latéral — et cela sur toutes les pages, à toutes les largeurs.
 */
const WIDTHS = [1920, 1440, 1280, 1024];

const PAGES = [
  ["tableau de bord", "/dashboard"],
  ["agenda", "/dashboard/agenda"],
  ["clients", "/dashboard/clients"],
  ["carte clients", "/dashboard/carte"],
  ["tournées", "/dashboard/tournees"],
  ["documents", "/dashboard/documents"],
] as const;

async function metrics(page: Page) {
  return page.evaluate(() => {
    const aside = document.querySelector("aside")!.getBoundingClientRect();
    const main = document.querySelector("main")!.getBoundingClientRect();
    window.scrollTo(9999, window.scrollY);
    const scrolled = Math.round(window.scrollX);
    window.scrollTo(0, window.scrollY);
    return {
      asideWidth: Math.round(aside.width),
      asideRight: Math.round(aside.right),
      mainLeft: Math.round(main.left),
      mainWidth: Math.round(main.width),
      scrolled,
    };
  });
}

test("le contenu récupère l'espace quand la barre se replie", async ({ page }) => {
  test.setTimeout(240_000);
  const failures: string[] = [];

  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });

    for (const [label, path] of PAGES) {
      await page.goto(path, { waitUntil: "networkidle" });
      await page.waitForTimeout(800);

      const expanded = await metrics(page);
      // La barre est posée en fixe : le contenu commence là où elle finit.
      if (expanded.mainLeft < expanded.asideRight - 1) failures.push(`${label} à ${width}px : le contenu passe sous la barre déployée`);
      if (expanded.scrolled > 1) failures.push(`${label} à ${width}px : défilement latéral, barre déployée`);

      await page.getByRole("button", { name: "Réduire le menu" }).click();
      await page.waitForTimeout(500);

      const collapsed = await metrics(page);
      if (collapsed.asideWidth > 90) failures.push(`${label} à ${width}px : la barre ne s'est pas réduite (${collapsed.asideWidth}px)`);
      // Le contenu récupère l'espace, sauf là où il est volontairement
      // plafonné pour rester lisible (max-w-[1600px] sur les très grands
      // écrans) : il s'y recentre alors dans la place disponible, ce qui se
      // vérifie par des marges gauche et droite équivalentes.
      const available = width - collapsed.asideWidth;
      const centred = Math.abs((collapsed.mainLeft - collapsed.asideRight) - (width - collapsed.mainLeft - collapsed.mainWidth)) <= 2;
      const grew = collapsed.mainWidth > expanded.mainWidth;
      if (!grew && !(collapsed.mainWidth < available && centred)) {
        failures.push(`${label} à ${width}px : le contenu n'a ni élargi ni recentré (${collapsed.mainWidth}px pour ${available}px disponibles)`);
      }
      // Tolérance d'un pixel : arrondis de sous-pixel du navigateur.
      if (collapsed.mainLeft < collapsed.asideRight - 1) failures.push(`${label} à ${width}px : le contenu passe sous la barre réduite`);
      if (collapsed.scrolled > 1) failures.push(`${label} à ${width}px : défilement latéral, barre réduite`);

      await page.getByRole("button", { name: "Déployer le menu" }).click();
      await page.waitForTimeout(400);
    }
  }

  expect(failures, `Problèmes :\n${failures.join("\n")}`).toEqual([]);
});

test("menu à plat : tous les liens visibles, une seule page active, réglages et déconnexion à portée", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/dashboard/agenda", { waitUntil: "networkidle" });
  const sidebar = page.locator("aside.dashboard-sidebar");
  const nav = page.getByRole("navigation", { name: "Navigation principale" });

  // Plus rien à déplier : les titres ne sont pas des boutons, et les liens
  // sont visibles d'emblée — y compris ceux des autres sections.
  for (const title of ["Planning", "Clientèle", "Gestion"]) {
    await expect(nav.getByRole("group", { name: title })).toBeVisible();
    await expect(page.getByRole("button", { name: title, exact: true })).toHaveCount(0);
  }
  await expect(nav.getByText("Pilotage")).toHaveCount(0);
  for (const name of ["Tableau de bord", "Agenda", "Clients & animaux", "Prestations"]) {
    const link = nav.getByRole("link", { name, exact: true });
    await expect(link).toBeVisible();
    expect((await link.boundingBox())!.height, `« ${name} » : cible de 44 px`).toBeGreaterThanOrEqual(44);
  }

  // Une seule page active dans toute la barre.
  const current = sidebar.locator('[aria-current="page"]');
  await expect(current).toHaveCount(1);
  await expect(current).toHaveText(/Agenda/);

  // En bas, sans sous-menu à ouvrir : la déconnexion, toujours confirmée…
  await sidebar.getByRole("button", { name: "Se déconnecter" }).click();
  const confirm = page.getByRole("dialog", { name: "Se déconnecter ?" });
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "Annuler" }).click();
  await expect(confirm).toHaveCount(0);

  // … et les Paramètres, qui deviennent alors la page active.
  await sidebar.getByRole("link", { name: "Paramètres" }).click();
  await page.waitForURL("**/dashboard/parametres");
  await expect(current).toHaveCount(1);
  await expect(current).toHaveText(/Paramètres/);

  // Barre réduite : les libellés et les titres disparaissent, les noms
  // restent accessibles.
  await page.getByRole("button", { name: "Réduire le menu" }).click();
  await page.mouse.move(1000, 500);
  await page.waitForTimeout(600);
  const agendaLink = page.getByRole("link", { name: "Agenda", exact: true });
  await expect(agendaLink).toBeVisible();
  await expect(agendaLink).toHaveAttribute("title", "Agenda");
  await expect(nav.getByText("Planning", { exact: true })).toHaveCount(0);
  await expect(sidebar.getByRole("link", { name: "Paramètres" })).toHaveAttribute("title", "Paramètres");

  // La préférence survit au rechargement.
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.getByRole("button", { name: "Déployer le menu" })).toBeVisible();
  await page.getByRole("button", { name: "Déployer le menu" }).click();
});

test("sur un écran bas, la liste défile et le bloc du bas reste visible", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 520 });
  await page.goto("/dashboard", { waitUntil: "networkidle" });
  const sidebar = page.locator("aside.dashboard-sidebar");
  const nav = page.getByRole("navigation", { name: "Navigation principale" });

  expect(await nav.evaluate((element) => element.scrollHeight > element.clientHeight), "la liste défile").toBe(true);
  for (const control of [sidebar.getByRole("link", { name: "Paramètres" }), sidebar.getByRole("button", { name: "Se déconnecter" })]) {
    const box = (await control.boundingBox())!;
    expect(box.y + box.height, "le bloc du bas reste dans l'écran").toBeLessThanOrEqual(520);
  }
  // Le dernier lien de la liste s'atteint en défilant.
  await nav.getByRole("link", { name: "Prestations" }).scrollIntoViewIfNeeded();
  await expect(nav.getByRole("link", { name: "Prestations" })).toBeInViewport();
});
