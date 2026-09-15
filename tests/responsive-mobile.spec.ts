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
  await page.goto("/login");
  await page.fill('input[type="email"]', "praticien-test@pf-osteo-animale.fr");
  await page.fill('input[type="password"]', "Praticien-Test-2026!");
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard**", { timeout: 20000 });

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
