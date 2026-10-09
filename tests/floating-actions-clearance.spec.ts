import { expect, test, type Page } from "./helpers/test";

/**
 * Les deux boutons flottants (nouveau rendez-vous, gestion) restent en bas à
 * droite de l'écran : arrivé en bas d'une page, ils ne doivent plus recouvrir
 * ses derniers boutons — « Enregistrer les rappels » se retrouvait dessous.
 * La page se termine par un dégagement à leur hauteur.
 */
async function overlapsFloatingActions(page: Page, name: string): Promise<boolean> {
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const target = (await page.getByRole("button", { name }).boundingBox())!;
  const floating = [
    (await page.getByRole("button", { name: "Nouveau rendez-vous", exact: true }).last().boundingBox())!,
    (await page.getByRole("button", { name: /^Gestion des rendez-vous/ }).boundingBox())!,
  ];
  return floating.some((box) => target.x < box.x + box.width && target.x + target.width > box.x && target.y < box.y + box.height && target.y + target.height > box.y);
}

for (const [width, height] of [[1440, 900], [1024, 768]] as const) {
  test(`en bas des Paramètres, « Enregistrer les rappels » n'est pas sous les boutons flottants (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/dashboard/parametres?tab=schedule", { waitUntil: "networkidle" });
    await expect(page.getByRole("button", { name: "Enregistrer les rappels" })).toBeVisible();
    expect(await overlapsFloatingActions(page, "Enregistrer les rappels")).toBe(false);
  });
}
