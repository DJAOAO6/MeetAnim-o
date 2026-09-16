import { config } from "dotenv";
import { expect, test } from "@playwright/test";

config({ path: ".env.local" });

/**
 * Garde-fou responsive : aucune page principale ne doit déborder
 * horizontalement à une largeur de téléphone, la barre de navigation du bas
 * doit être atteignable, et une modale doit s'y présenter en feuille ancrée
 * en bas plutôt qu'en boîte centrée pensée pour un écran large.
 *
 * Tout tient dans une seule session : la connexion est limitée en débit côté
 * serveur (protection anti-force brute), un test par page épuiserait le quota
 * d'une exécution à l'autre.
 */
const PAGES = [
  ["tableau de bord", "/dashboard"],
  ["clients", "/dashboard/clients"],
  ["agenda", "/dashboard/agenda"],
  ["tournées", "/dashboard/tournees"],
  ["réglages", "/dashboard/parametres"],
] as const;

test("les pages principales tiennent dans un écran de téléphone", async ({ page }) => {
  // Session ouverte par le projet "setup" (tests/auth.setup.ts).

  for (const [label, path] of PAGES) {
    await page.goto(path);
    await page.waitForTimeout(1500);
    const { scrollWidth, innerWidth } = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }));
    // 1 px de marge : les arrondis de sous-pixel du navigateur, pas un débordement.
    expect(scrollWidth, `débordement horizontal sur « ${label} »`).toBeLessThanOrEqual(innerWidth + 1);
  }

  // Navigation du bas : présente, et chaque cible assez grande pour le pouce.
  const bottomNav = page.getByRole("navigation", { name: /mobile/i });
  await expect(bottomNav).toBeVisible();
  const navLinks = bottomNav.getByRole("link");
  for (let index = 0; index < await navLinks.count(); index += 1) {
    const box = (await navLinks.nth(index).boundingBox())!;
    expect(box.height, "cible tactile trop petite dans la barre du bas").toBeGreaterThanOrEqual(44);
  }

  // Modale : ancrée en bas de l'écran sur téléphone, bouton principal visible.
  await page.goto("/dashboard/clients");
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: /nouveau client/i }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const dialogBox = (await dialog.boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(dialogBox.width, "la modale doit occuper toute la largeur sur téléphone").toBeGreaterThan(viewport.width - 2);
  expect(dialogBox.y + dialogBox.height, "la modale doit être ancrée en bas de l'écran").toBeGreaterThan(viewport.height - 2);
  await expect(page.getByRole("button", { name: /créer le client/i })).toBeInViewport();
});

test("le tiroir de navigation garde ses libellés, même barre réduite sur grand écran", async ({ page }) => {
  // Le repli est un réglage propre à l'appareil, partagé par les deux
  // affichages : posé ici tel qu'il le serait après un repli sur un écran
  // large. Sous 768 px la barre reste un tiroir de 260 px — une colonne
  // d'icônes muettes y serait un bug, pas un gain de place.
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "1002pattes.sidebar.preferences",
      JSON.stringify({ sidebarBehavior: "hover", menuBehavior: "click", defaultState: "collapsed" }),
    );
  });

  await page.goto("/dashboard/agenda", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Ouvrir le menu", exact: true }).click();

  // La page agenda a son propre <aside> (encarts latéraux) : on vise la barre.
  const drawer = page.locator("aside.dashboard-sidebar");
  await expect(drawer).toHaveAttribute("data-open", "true");
  await expect(drawer.getByRole("button", { name: "Planning" })).toBeVisible();
  await expect(drawer.getByRole("link", { name: "Agenda", exact: true })).toBeVisible();

  // Le tiroir vient se poser au bord gauche sans déborder de l'écran. Mesuré
  // en attendant la fin du glissement : la valeur lue en cours d'animation ne
  // dit rien de l'endroit où il s'arrête.
  await expect.poll(async () => Math.round((await drawer.boundingBox())!.x)).toBe(0);
  expect((await drawer.boundingBox())!.width).toBeLessThanOrEqual(page.viewportSize()!.width);

  // Les catégories restent manœuvrables au doigt.
  const clientele = drawer.getByRole("button", { name: "Clientèle" });
  expect((await clientele.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await clientele.click();
  await expect(drawer.getByRole("link", { name: "Carte clients" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Planning" })).toHaveAttribute("aria-expanded", "false");
});

test("les réglages de navigation ne proposent pas de survol sur un écran tactile", async ({ page }) => {
  await page.goto("/dashboard/parametres?tab=customization", { waitUntil: "networkidle" });
  await page.getByRole("navigation", { name: "Sections de personnalisation" }).getByRole("button", { name: /^Navigation/ }).click();

  await expect(page.getByRole("heading", { name: "Comportement de la navigation" })).toBeVisible();
  // Un réglage sans effet est pire qu'un réglage absent : au doigt, le survol
  // n'existe pas, donc ces deux choix ne sont pas proposés.
  await expect(page.getByRole("group", { name: "Ouverture de la barre latérale" })).toHaveCount(0);
  await expect(page.getByRole("group", { name: "Ouverture des menus" })).toHaveCount(0);
  await expect(page.getByText("Cet appareil est tactile")).toBeVisible();
});
