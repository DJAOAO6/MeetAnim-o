import { expect, test, type Page } from "@playwright/test";
import { config } from "dotenv";
import { neon } from "./helpers/sql";

config({ path: ".env.local" });
const sql = neon(process.env.DATABASE_URL!);

/**
 * Retour visuel et taille des boutons (PLAN-BOUTONS, règle 1.6 ; chantier
 * B1). Trois règles globales et les composants communs, qu'une retouche de
 * `globals.css` défait sans bruit :
 *
 * - la main sur tout ce qui se clique (Tailwind 4 ne la met plus) ;
 * - un bouton blanc qui réagit au survol — la règle qui repeint les fonds
 *   blancs du tableau de bord l'en empêchait ;
 * - un changement à l'appui ;
 * - 44 px au moins, et un nom pour les boutons à icône seule.
 *
 * La demande de test est supprimée à la fin.
 */
const REQUEST_ID = "e2e-buttons-request";
const REQUESTER = "Bertille Bouton";
const FAR = new Date(Date.now() + 50 * 24 * 3600_000).toISOString().slice(0, 10);

/**
 * Les seuls boutons qui n'ont pas la main : ceux qu'on attrape pour déplacer
 * ou étirer quelque chose. Leur curseur dit ce geste-là.
 */
const CURSOR_EXCEPTIONS = [".cursor-grab", ".cursor-grabbing", ".cursor-ns-resize"];

const PAGES = ["/dashboard", "/dashboard/agenda", "/dashboard/clients", "/dashboard/prestations"];

async function cleanup() {
  await sql`DELETE FROM "Appointment" WHERE id = ${REQUEST_ID}`;
}

async function useDarkTheme(page: Page) {
  await page.addInitScript(() => localStorage.setItem("1002pattes-dashboard-theme-v2", JSON.stringify({ mode: "dark" })));
}

test.beforeAll(async () => {
  await cleanup();
  // Une demande en attente : ses boutons « Accepter », « Décaler », « Refuser ».
  await sql`INSERT INTO "Appointment" (id, date, start, duration, "clientName", "animalName", "serviceName", mode, location, price, status, notes, "updatedAt")
    VALUES (${REQUEST_ID}, ${`${FAR}T00:00:00.000Z`}, '10:13', 60, ${REQUESTER}, 'Pression', 'Ostéopathie canine', 'CABINET', 'Cabinet', 60, 'PENDING', '', now())`;
});

test.afterAll(cleanup);

test("tout bouton cliquable montre la main", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const path of PAGES) {
    await page.goto(path, { waitUntil: "networkidle" });
    const { checked, wrong } = await page.evaluate((exceptions) => {
      const buttons = [...document.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")].filter((button) => {
        const box = button.getBoundingClientRect();
        return box.width > 0 && box.height > 0 && getComputedStyle(button).visibility !== "hidden" && !exceptions.some((selector) => button.matches(selector));
      });
      return {
        checked: buttons.length,
        wrong: buttons.filter((button) => getComputedStyle(button).cursor !== "pointer").map((button) => `${getComputedStyle(button).cursor} — ${(button.getAttribute("aria-label") || button.textContent || "").trim().slice(0, 50)}`),
      };
    }, CURSOR_EXCEPTIONS);
    expect(checked, `${path} : des boutons à contrôler`).toBeGreaterThan(0);
    expect(wrong, `${path} : boutons sans la main`).toEqual([]);
  }
});

for (const theme of ["clair", "sombre"] as const) {
  test(`« Décaler » change de fond au survol, et à l'appui (thème ${theme})`, async ({ page }) => {
    if (theme === "sombre") await useDarkTheme(page);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`/dashboard/agenda?date=${FAR}`, { waitUntil: "networkidle" });
    await expect(page.locator("[data-dashboard-theme]").first()).toHaveAttribute("data-theme", theme === "sombre" ? "dark" : "light");

    const button = page.locator("article").filter({ hasText: REQUESTER }).first().getByRole("button", { name: "Décaler", exact: true });
    await button.scrollIntoViewIfNeeded();
    const background = () => button.evaluate((element) => getComputedStyle(element).backgroundColor);
    await page.mouse.move(5, 5);
    const atRest = await background();

    // Un vrai survol, puis le temps de la transition.
    await button.hover();
    await expect.poll(background, { message: "le fond au survol diffère du fond au repos" }).not.toBe(atRest);

    // À l'appui : relâché hors du bouton, pour ne rien déclencher.
    const box = (await button.boundingBox())!;
    await page.mouse.down();
    await expect.poll(() => button.evaluate((element) => getComputedStyle(element).filter)).toContain("brightness");
    await page.mouse.move(box.x, box.y + 300);
    await page.mouse.up();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
}

test("les boutons communs font 44 px ; un bouton à icône a un nom, et son infobulle au clavier", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/dashboard/clients", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Nouveau client" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Nouveau client" });

  // Button : l'action principale et l'annulation de la fenêtre.
  for (const name of ["Créer le client", "Annuler"]) {
    const box = (await dialog.getByRole("button", { name, exact: true }).boundingBox())!;
    expect(box.height, `« ${name} »`).toBeGreaterThanOrEqual(44);
  }

  // IconButton : la croix. Son intitulé est son nom accessible.
  const close = dialog.getByRole("button", { name: "Fermer", exact: true });
  const box = (await close.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(44);
  expect(box.width).toBeGreaterThanOrEqual(44);

  // L'infobulle : absente tant que le bouton n'a ni survol ni focus clavier…
  const tooltip = close.locator("[data-tooltip]");
  await page.mouse.move(5, 5);
  await close.evaluate((element: HTMLElement) => element.blur());
  await expect(tooltip).toBeHidden();
  // … présente dès qu'on y arrive à la tabulation.
  await dialog.getByLabel("Prénom").first().focus();
  await page.keyboard.press("Shift+Tab");
  await expect(close).toBeFocused();
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toHaveText("Fermer");

  await page.keyboard.press("Enter");
  await expect(dialog).toHaveCount(0);
});
