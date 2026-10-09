import { config } from "dotenv";
import { expect, test, type Page } from "./helpers/test";
import AxeBuilder from "@axe-core/playwright";
import { neon } from "./helpers/sql";

config({ path: ".env.local" });
const sql = neon(process.env.DATABASE_URL!);

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
    // Les éléments fautifs, pas seulement leur nombre : sans eux, un échec
    // ne dit pas où chercher.
    const detail = violations.map((violation) => ({ id: violation.id, nodes: violation.nodes.map((node) => `${node.target.join(" ")} — ${node.failureSummary?.split("\n")[1]?.trim() ?? ""}`) }));
    expect(violations, `${label} : ${JSON.stringify(detail, null, 2)}`).toEqual([]);
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

/**
 * Contraste du texte (règle axe « color-contrast »), dans les deux palettes,
 * en clair et en sombre : 4,5:1, ou 3:1 pour un grand texte.
 *
 * Le contrôle général ci-dessus ne tourne qu'avec le thème par défaut : un
 * texte resté foncé sur un fond devenu foncé (rendez-vous à domicile,
 * étiquette de l'heure courante) n'y apparaît jamais. D'où ce passage par
 * chaque thème.
 *
 * Exceptions voulues, et seulement elles :
 * - les jours du mois voisin dans le mini-calendrier, atténués exprès
 *   (`data-outside-month`) ;
 * - les éléments désactivés, qu'axe écarte de lui-même.
 */
const CONTRAST_PAGES = [...PAGES, ["prestations", "/dashboard/prestations"]] as const;
const CONTRAST_EXCEPTIONS = ["[data-outside-month]"];

// Un rendez-vous à domicile dans la semaine affichée : c'est son texte qui
// restait foncé en sombre, et l'agenda de la base de test peut être vide.
const HOME_VISIT_ID = "e2e-contrast-home";
const TODAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date());

test.describe("contraste du texte", () => {
  test.beforeAll(async () => {
    await sql`DELETE FROM "Appointment" WHERE id = ${HOME_VISIT_ID}`;
    await sql`INSERT INTO "Appointment" (id, date, start, duration, "clientName", "animalName", "serviceName", mode, location, price, status, notes, "updatedAt")
      VALUES (${HOME_VISIT_ID}, ${`${TODAY}T00:00:00.000Z`}, '12:07', 60, 'Colette Contraste', 'Nuance', 'Ostéopathie canine', 'DOMICILE', 'Rouen', 60, 'CONFIRMED', '', now())`;
  });

  test.afterAll(async () => {
    await sql`DELETE FROM "Appointment" WHERE id = ${HOME_VISIT_ID}`;
  });

  for (const [palette, paletteLabel] of [["1002pattes", "1002 Pattes"], ["classic", "classique"]] as const) {
    for (const [mode, modeLabel] of [["light", "clair"], ["dark", "sombre"]] as const) {
      test(`contraste du texte — palette ${paletteLabel}, thème ${modeLabel}`, async ({ page }) => {
        test.setTimeout(90_000);
        await page.addInitScript(([themeMode, themePalette]) => localStorage.setItem("1002pattes-dashboard-theme-v2", JSON.stringify({ mode: themeMode, palette: themePalette })), [mode, palette]);
        const failures: string[] = [];

        for (const [label, path] of CONTRAST_PAGES) {
          await page.goto(path, { waitUntil: "networkidle" });
          await page.waitForTimeout(1200);
          await expect(page.locator("[data-dashboard-theme]").first()).toHaveAttribute("data-theme", mode);
          if (path === "/dashboard/agenda") await expect(page.locator("[data-testid='agenda-event']").filter({ hasText: "Nuance" }).first()).toBeVisible();
          let builder = new AxeBuilder({ page }).withRules(["color-contrast"]);
          for (const selector of CONTRAST_EXCEPTIONS) builder = builder.exclude(selector);
          const results = await builder.analyze();
          for (const node of results.violations.flatMap((violation) => violation.nodes)) {
            const data = (node.any[0]?.data ?? {}) as { fgColor?: string; bgColor?: string; contrastRatio?: number };
            failures.push(`${label} : ${data.contrastRatio}:1 (${data.fgColor} sur ${data.bgColor}) — ${node.html.replace(/\s+/g, " ").slice(0, 120)}`);
          }
        }

        expect(failures, `Contrastes insuffisants :\n${failures.join("\n")}`).toEqual([]);
      });
    }
  }
});
