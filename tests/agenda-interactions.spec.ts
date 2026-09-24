import { expect, test, type Page } from "@playwright/test";
import { config } from "dotenv";
import { neon } from "./helpers/sql";

config({ path: ".env.local" });
const sql = neon(process.env.DATABASE_URL!);

/**
 * Cases vides de l'agenda : survol, clavier et « Indisponible / Fermé ».
 * (La sélection à la souris et au doigt : agenda-slot-selection et
 * agenda-slot-touch.)
 */
const PRACTITIONER = "praticien-test@pf-osteo-animale.fr";
const menu = (page: Page) => page.getByRole("dialog", { name: "Actions du créneau sélectionné" });

/**
 * Descend depuis la case active jusqu'à une case libre et ouverte, puis
 * Entrée. La case de départ suit l'heure courante : elle peut tomber sur une
 * zone fermée, dont le menu propose d'autres actions — on le referme et on
 * continue.
 */
async function openFreeSlotMenu(page: Page) {
  // Une colonne peut n'avoir aucune case libre (tournée, puis fermeture) :
  // on remonte alors en haut du jour précédent et on recommence.
  for (let day = 0; day < 7; day += 1) {
    for (let step = 0; step < 40; step += 1) {
      await page.keyboard.press("Enter");
      if (await menu(page).isVisible().catch(() => false)) {
        if (await menu(page).getByRole("button", { name: "Nouveau rendez-vous" }).count()) return;
        await page.keyboard.press("Escape");
      }
      await page.keyboard.press("ArrowDown");
    }
    await page.keyboard.press("ArrowLeft");
    for (let step = 0; step < 40; step += 1) await page.keyboard.press("ArrowUp");
  }
}

let originalAvailability: unknown = null;

test.describe.configure({ mode: "serial" });
test.beforeAll(async () => {
  const [row] = await sql`SELECT availability FROM "BusinessProfile" WHERE "organizationId" = 'org-1002-pattes'`;
  originalAvailability = row.availability;
});
test.afterAll(async () => {
  // Les horaires de l'espace de test reviennent exactement à leur état d'avant.
  await sql`UPDATE "BusinessProfile" SET availability = ${JSON.stringify(originalAvailability)}::jsonb WHERE "organizationId" = 'org-1002-pattes'`;
});

test("au survol d'une case libre, un « + » ; au-dessus d'un rendez-vous, rien", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/dashboard/agenda", { waitUntil: "networkidle" });
  const hover = page.getByTestId("agenda-slot-hover");
  await expect(hover.first(), "au repos, rien").toHaveAttribute("data-visible", "false");

  // Une case libre : on cherche, colonne par colonne, un point où le repère s'allume.
  const layers = page.getByTestId("agenda-slot-layer");
  await layers.first().scrollIntoViewIfNeeded();
  // Seulement la partie visible de la grille, sous l'en-tête des jours collé en haut.
  const headerBottom = (await page.getByTestId("agenda-day-header").boundingBox())!.y + 80;
  let lit = false;
  for (let column = 0; column < (await layers.count()) && !lit; column += 1) {
    const box = (await layers.nth(column).boundingBox())!;
    for (let y = Math.max(box.y + 20, headerBottom); y < Math.min(box.y + box.height - 20, 880) && !lit; y += 37) {
      await page.mouse.move(box.x + box.width / 2, y);
      await page.waitForTimeout(30);
      lit = (await hover.nth(column).getAttribute("data-visible")) === "true";
    }
  }
  expect(lit, "une case libre s'allume au survol").toBe(true);

  // Au-dessus d'un rendez-vous : plus de repère.
  const event = page.getByTestId("agenda-event").first();
  await event.scrollIntoViewIfNeeded();
  const eventBox = (await event.boundingBox())!;
  await page.mouse.move(eventBox.x + eventBox.width / 2, eventBox.y + eventBox.height / 2);
  await page.waitForTimeout(80);
  const visibleCount = await page.locator("[data-testid='agenda-slot-hover'][data-visible='true']").count();
  expect(visibleCount, "aucun « + » par-dessus un rendez-vous").toBe(0);
});

test("au clavier : flèches entre les créneaux, Entrée ouvre les trois actions", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/dashboard/agenda", { waitUntil: "networkidle" });
  const grid = page.getByRole("region", { name: "Planning de la semaine" });
  await grid.focus();
  const cursor = page.getByTestId("agenda-keyboard-cursor");
  await expect(cursor, "une case active, bien visible").toBeVisible();
  const before = (await cursor.boundingBox())!;
  await page.keyboard.press("ArrowDown");
  const after = (await cursor.boundingBox())!;
  expect(after.y, "la case descend d'un créneau").toBeGreaterThan(before.y);
  await page.keyboard.press("ArrowRight");
  const moved = (await cursor.boundingBox())!;
  expect(moved.x !== after.x || moved.y !== after.y, "la case change de jour").toBe(true);

  await openFreeSlotMenu(page);
  await expect(menu(page)).toBeVisible();
  await expect(menu(page).getByRole("button")).toHaveText(["Nouveau rendez-vous", "Bloquer le créneau", /^Indisponible \/ Fermé/]);
  await page.keyboard.press("Escape");
  await expect(menu(page)).toHaveCount(0);
  await expect(grid, "le focus revient dans la grille").toBeFocused();

  // L'aide s'ouvre au focus et se referme avec Échap, sans bouger la souris.
  const help = page.getByRole("button", { name: "Aide sur l’agenda" });
  await help.focus();
  await expect(page.getByRole("tooltip")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("tooltip")).toBeHidden();
});

test("sans le droit de modifier les horaires, « Indisponible / Fermé » est grisé et dit pourquoi", async ({ page }) => {
  // D'autres specs accordent ce droit au compte de test sans le retirer :
  // on le retire le temps de l'essai, puis on rend les droits d'avant.
  const [account] = await sql`SELECT permissions FROM "User" WHERE email = ${PRACTITIONER}`;
  await sql`UPDATE "User" SET permissions = array_remove(permissions, 'MANAGE_PUBLIC_SETTINGS') WHERE email = ${PRACTITIONER}`;
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/dashboard/agenda", { waitUntil: "networkidle" });
    await page.getByRole("region", { name: "Planning de la semaine" }).focus();
    await openFreeSlotMenu(page);
    const close = menu(page).getByRole("button", { name: /Indisponible \/ Fermé/ });
    await expect(close).toHaveAttribute("aria-disabled", "true");
    await expect(close).toContainText("Réservé aux comptes autorisés à modifier les horaires");
  } finally {
    await sql`UPDATE "User" SET permissions = ${account.permissions}::text[] WHERE email = ${PRACTITIONER}`;
  }
});

test("« Indisponible / Fermé » ferme vraiment le créneau", async ({ page }) => {
  // Le droit de modifier les horaires, le temps de l'essai.
  const [account] = await sql`SELECT permissions FROM "User" WHERE email = ${PRACTITIONER}`;
  await sql`UPDATE "User" SET permissions = array_append(permissions, 'MANAGE_PUBLIC_SETTINGS') WHERE email = ${PRACTITIONER}`;
  try {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/dashboard/agenda", { waitUntil: "networkidle" });
  const grid = page.getByRole("region", { name: "Planning de la semaine" });
  await grid.focus();
  await openFreeSlotMenu(page);
  await menu(page).getByRole("button", { name: "Indisponible / Fermé" }).click();
  await expect(page.getByText(/Indisponible de \d{2}:\d{2} à \d{2}:\d{2}/)).toBeVisible();
  const [row] = await sql`SELECT availability FROM "BusinessProfile" WHERE "organizationId" = 'org-1002-pattes'`;
  const closures = (row.availability as { closures: { reason: string; scope: string }[] }).closures;
  expect(closures.some((closure) => closure.reason === "Indisponible" && closure.scope === "Tout fermer"), "une fermeture exceptionnelle enregistrée").toBe(true);
  } finally {
    await sql`UPDATE "User" SET permissions = ${account.permissions}::text[] WHERE email = ${PRACTITIONER}`;
  }
});
