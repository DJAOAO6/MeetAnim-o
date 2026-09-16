import { config } from "dotenv";
import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

config({ path: ".env.local" });

/**
 * Contrôle d'accessibilité automatique des écrans principaux, y compris en
 * mode « Personnaliser le tableau de bord » : c'est l'interface la plus
 * récente, celle où des régressions (boutons sans intitulé, contrastes,
 * groupes sans nom) passeraient le plus facilement inaperçues.
 *
 * Seules les violations critiques et sérieuses sont bloquantes. Les
 * signalements mineurs d'axe sont nombreux, souvent contextuels, et en faire
 * un échec de test rendrait la suite ingérable sans gain réel pour les
 * utilisateurs.
 */
const PAGES = [
  ["tableau de bord", "/dashboard"],
  ["agenda", "/dashboard/agenda"],
  ["clients", "/dashboard/clients"],
] as const;

async function seriousViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  return results.violations.filter((violation) => violation.impact === "critical" || violation.impact === "serious");
}

test("les écrans principaux ne présentent pas de violation d'accessibilité sérieuse", async ({ page }) => {
  for (const [label, path] of PAGES) {
    await page.goto(path);
    await page.waitForTimeout(1500);
    const violations = await seriousViolations(page);
    expect(violations, `${label} : ${JSON.stringify(violations.map((violation) => ({ id: violation.id, nodes: violation.nodes.length })), null, 2)}`).toEqual([]);
  }
});

test("le mode personnalisation du tableau de bord reste accessible", async ({ page }) => {
  // Le mode personnalisation s'ouvre depuis Paramètres › Personnalisation,
  // qui renvoie ici avec ce paramètre.
  await page.goto("/dashboard?personnaliser=1");
  await page.waitForTimeout(1200);

  const violations = await seriousViolations(page);
  expect(violations, JSON.stringify(violations.map((violation) => ({ id: violation.id, nodes: violation.nodes.length })), null, 2)).toEqual([]);

  // Chaque bloc doit être déplaçable sans souris : la poignée est un vrai
  // bouton, atteignable au clavier et nommé.
  const handle = page.getByRole("button", { name: /déplacer le bloc/i }).first();
  await handle.focus();
  await expect(handle).toBeFocused();
});
