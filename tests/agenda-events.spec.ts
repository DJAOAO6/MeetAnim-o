import { expect, test } from "@playwright/test";

/**
 * Apparence des rendez-vous : le contenu suit la hauteur de la carte, le
 * mode se lit par une icône, et glisser un rendez-vous ne touche jamais aux
 * cases vides.
 */
test.describe.configure({ mode: "serial" });

test("une carte haute montre le détail et son icône ; une carte courte, une ligne et une bulle", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/dashboard/agenda", { waitUntil: "networkidle" });
  const cards = page.getByTestId("agenda-event");
  await expect(cards.first()).toBeVisible();
  await expect(page.getByRole("region", { name: "Planning de la semaine" })).not.toContainText(/[✓✕↔]/);

  // Confortable, 30 min : un rendez-vous de 45 min fait 60 px, détail complet.
  const full = page.locator("[data-testid='agenda-event'][data-size='full']").first();
  await expect(full).toBeVisible();
  // L'icône n'apparaît que sur une carte assez large (pas côte à côte).
  await expect(page.locator("[data-testid='agenda-event'][data-size='full'] svg").filter({ visible: true }).first(), "l'icône du mode").toBeVisible();
  await expect(full).toContainText(/\d{2}:\d{2} – \d{2}:\d{2}/);

  // Compact, 1 h : tout rétrécit, ce qui ne tient plus passe dans la bulle.
  await page.getByRole("button", { name: "Affichage" }).click();
  await page.getByRole("button", { name: "1 h", exact: true }).click();
  await page.getByRole("button", { name: "Compact" }).click();
  await page.keyboard.press("Escape");
  // Seules les longues plages (tournées, journées bloquées) gardent le détail.
  const small = page.locator("[data-testid='agenda-event'][data-size='tiny'], [data-testid='agenda-event'][data-size='medium']").first();
  await expect(small).toBeVisible();
  await expect(small).toHaveAttribute("title", /\d{2}:\d{2} – \d{2}:\d{2} · .+/);
});

test("glisser un rendez-vous n'allume pas les cases vides et n'ouvre pas leur menu", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/dashboard/agenda", { waitUntil: "networkidle" });
  const card = page.locator("[data-testid='agenda-event'][data-size='full'][aria-label^='Ouvrir le rendez-vous']").first();
  await card.scrollIntoViewIfNeeded();
  const box = (await card.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + 12;

  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + 40, { steps: 6 });
  await page.mouse.move(x, y + 90, { steps: 6 });
  await expect(page.locator("[data-testid='agenda-slot-hover'][data-visible='true']"), "aucun « + » pendant le glissement").toHaveCount(0);
  // Retour au point de départ avant de lâcher : rien n'est enregistré.
  await page.mouse.move(x, y, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByRole("dialog", { name: "Actions du créneau sélectionné" })).toHaveCount(0);

  // Et le clic suivant sur la carte l'ouvre normalement. Clic aux
  // coordonnées : la carte est à l'écran, et un défilement automatique avant
  // le clic refermerait la fiche (elle se ferme au défilement).
  await page.mouse.click(x, box.y + box.height / 2);
  await expect(page.getByRole("dialog").first()).toBeVisible();
});
