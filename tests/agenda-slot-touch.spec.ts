import { config } from "dotenv";
import { expect, test, type Page } from "@playwright/test";

config({ path: ".env.local" });

/**
 * Sélection d'un créneau au doigt.
 *
 * Le test le plus important de ce fichier est le premier : **faire défiler
 * l'agenda ne doit jamais sélectionner un créneau**. C'est le point §35, et
 * c'est le défaut qui avait déjà été signalé sur le déplacement des
 * rendez-vous. D'où l'usage de vrais événements tactiles via CDP : une
 * simulation par événements de souris ne reproduirait pas l'arbitrage du
 * navigateur entre défilement et geste.
 */
async function realTouch(page: Page, points: Array<{ x: number; y: number }>, holdMs = 30) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [points[0]] });
  for (const point of points.slice(1)) {
    await page.waitForTimeout(holdMs);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [point] });
  }
  await page.waitForTimeout(holdMs);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

/** Un point sûrement dans la couche interactive **et** dans l'écran. */
async function touchPoint(page: Page) {
  const layer = page.getByTestId("agenda-slot-layer").first();
  // Amener le haut de la grille près du haut de l'écran : « si besoin » ne
  // suffit pas, une grille à peine entamée en bas d'écran (sous le panneau des
  // demandes en attente) compte déjà comme visible, et l'appui tombait alors
  // sur la barre de navigation du bas.
  await layer.evaluate((element) => window.scrollTo(0, element.getBoundingClientRect().top + window.scrollY - 120));
  await page.waitForTimeout(300);
  const box = (await layer.boundingBox())!;
  const viewport = page.viewportSize()!;
  const top = Math.max(box.y, 90);
  const bottom = Math.min(box.y + box.height, viewport.height - 110);
  expect(bottom, "la grille doit occuper une partie de l'écran").toBeGreaterThan(top);
  // Un point libre : ni rendez-vous ni bloc de tournée par-dessus (appuyer
  // sur un bloc de tournée ouvre la tournée, pas la feuille de créneau).
  const x = box.x + box.width / 2;
  const y = await layer.evaluate((element, { x, top, bottom }) => {
    for (let y = Math.round((top + bottom) / 2), step = 0; step < 400; step++) {
      const candidate = step % 2 ? y + Math.ceil(step / 2) * 8 : y - Math.ceil(step / 2) * 8;
      if (candidate < top || candidate > bottom) continue;
      const hit = document.elementFromPoint(x, candidate);
      if (hit && element.contains(hit) && !hit.closest("button, a, [role='button']")) return candidate;
    }
    return null;
  }, { x, top, bottom });
  expect(y, "aucun créneau libre visible dans la grille").not.toBeNull();
  return { x, y: y! };
}

/**
 * Sur mobile, l'agenda montre un jour. On l'amène sur un mercredi à quatre
 * semaines : loin des rendez-vous de démonstration, et hors des tournées
 * récurrentes (lundi, mardi, vendredi) — un créneau occupé ignore l'appui,
 * à juste titre, et le test échouerait pour de mauvaises raisons.
 */
async function openAgenda(page: Page) {
  await page.goto("/dashboard/agenda", { waitUntil: "networkidle" });
  const daysAhead = ((3 - new Date().getDay() + 7) % 7) + 28;
  const next = page.getByRole("button", { name: "Afficher le jour suivant" });
  for (let day = 0; day < daysAhead; day += 1) await next.click();
  await page.waitForTimeout(1200);
}

test("faire défiler l’agenda au doigt ne sélectionne jamais de créneau", async ({ page }) => {
  await openAgenda(page);
  const point = await touchPoint(page);

  const before = await page.evaluate(() => Math.round(window.scrollY));
  // Doigt vers le bas : la page remonte. Direction choisie pour qu'il reste
  // toujours de la place, quel que soit l'endroit où la grille a été amenée.
  await realTouch(page, [point, ...Array.from({ length: 6 }, (_, index) => ({ x: point.x, y: point.y + (index + 1) * 20 }))]);
  await page.waitForTimeout(700);

  const after = await page.evaluate(() => Math.round(window.scrollY));
  expect(after, "le défilement tactile doit continuer de fonctionner").toBeLessThan(before);
  await expect(page.getByRole("dialog"), "un simple défilement ne doit rien ouvrir").toHaveCount(0);
});

test("un appui simple ouvre la feuille de créneau, avec les durées possibles", async ({ page }) => {
  await openAgenda(page);
  const point = await touchPoint(page);

  await realTouch(page, [point]);
  await page.waitForTimeout(800);

  const sheet = page.getByRole("dialog");
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("heading", { name: "Nouveau créneau" })).toBeVisible();
  await expect(sheet.getByRole("group", { name: "Durée du créneau" })).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Créer un rendez-vous" })).toBeVisible();
});

test("changer la durée depuis la feuille met à jour le créneau", async ({ page }) => {
  await openAgenda(page);
  await realTouch(page, [await touchPoint(page)]);
  await page.waitForTimeout(800);

  const sheet = page.getByRole("dialog");
  await sheet.getByRole("button", { name: "2 h", exact: true }).click();
  await page.waitForTimeout(300);

  await expect(sheet.getByRole("button", { name: "2 h", exact: true })).toHaveAttribute("aria-pressed", "true");
  const text = (await sheet.textContent())!;
  const range = text.match(/(\d{2}):(\d{2}) → (\d{2}):(\d{2})/)!;
  const minutes = (Number(range[3]) * 60 + Number(range[4])) - (Number(range[1]) * 60 + Number(range[2]));
  expect(minutes, "la plage doit suivre la durée choisie").toBe(120);
});

test("la feuille mène au formulaire, déjà réglé sur le créneau choisi", async ({ page }) => {
  await openAgenda(page);
  await realTouch(page, [await touchPoint(page)]);
  await page.waitForTimeout(800);

  const sheet = page.getByRole("dialog");
  const start = (await sheet.textContent())!.match(/(\d{2}:\d{2}) → /)![1];
  await sheet.getByRole("button", { name: "Créer un rendez-vous" }).click();

  await expect(page.getByRole("heading", { name: "Nouveau rendez-vous" })).toBeVisible({ timeout: 15000 });
  await expect(page.getByLabel("Heure")).toHaveValue(start);
});
