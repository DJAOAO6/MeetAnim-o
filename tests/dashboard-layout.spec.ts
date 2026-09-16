import { config } from "dotenv";
import { expect, test } from "@playwright/test";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.local" });

const EMAIL = "praticien-test@pf-osteo-animale.fr";

async function storedLayout(): Promise<Array<{ id: string; span: number; visible: boolean }> | null> {
  const sql = neon(process.env.DATABASE_URL!);
  const rows = await sql`SELECT p."widgets" FROM "DashboardPreferences" p JOIN "User" u ON u.id = p."userId" WHERE u.email = ${EMAIL}`;
  return rows.length ? (rows[0] as { widgets: Array<{ id: string; span: number; visible: boolean }> }).widgets : null;
}

/**
 * Tableau de bord personnalisable : la disposition doit survivre au
 * rechargement ET être rattachée au compte, pas au navigateur — d'où la
 * lecture directe en base plutôt qu'un simple contrôle d'affichage.
 *
 * Une seule session pour tout le scénario : la connexion est limitée en
 * débit côté serveur.
 */
test("réorganiser, redimensionner et masquer un bloc, puis retrouver sa disposition", async ({ page }) => {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`DELETE FROM "DashboardPreferences" WHERE "userId" IN (SELECT id FROM "User" WHERE email = ${EMAIL})`;

  // Session ouverte par le projet "setup" (tests/auth.setup.ts).
  // Le mode personnalisation s'ouvre depuis Paramètres › Personnalisation,
  // qui renvoie sur le tableau de bord avec ce paramètre.
  await page.goto("/dashboard?personnaliser=1");

  // Redimensionnement : « Prochaine tournée » passe de 1 à 2 colonnes.
  const tourWidth = page.getByRole("group", { name: /largeur du bloc prochaine tournée/i });
  await tourWidth.getByRole("button", { name: "2", exact: true }).click();

  // Masquage : le résumé d'activité rejoint le panneau « Ajouter un bloc ».
  await page.getByTestId("block-activitySummary").getByRole("button", { name: "Masquer" }).click();

  // Réordonnancement à la souris depuis la poignée. dnd-kit n'arme le
  // déplacement qu'après quelques pixels puis suit le pointeur : le geste est
  // joué en plusieurs pas, comme un vrai glissement.
  const order = () => page.getByTestId("dashboard-grid").locator("[data-testid^=block-]").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-testid")));
  const orderBefore = await order();

  const handle = page.getByRole("button", { name: /déplacer le bloc chiffres clés/i });
  await handle.hover();
  const handleBox = (await handle.boundingBox())!;
  const target = (await page.getByTestId("block-planning").boundingBox())!;
  await page.mouse.down();
  for (let step = 1; step <= 10; step += 1) {
    await page.mouse.move(target.x + target.width / 2, handleBox.y + ((target.y + target.height / 2 - handleBox.y) * step) / 10, { steps: 2 });
    await page.waitForTimeout(60);
  }
  await page.mouse.up();
  await page.waitForTimeout(400);

  const orderAfter = await order();
  expect(orderAfter, "le glissement doit réordonner les blocs").not.toEqual(orderBefore);

  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  // Le bandeau de personnalisation disparaît en sortant du mode édition :
  // la confirmation passe par un message, pas par l'indicateur d'état.
  await expect(page.getByText(/disposition du tableau de bord enregistrée/i)).toBeVisible({ timeout: 15000 });

  const saved = await storedLayout();
  expect(saved, "la disposition doit être enregistrée en base pour ce compte").not.toBeNull();
  expect(saved!.find((widget) => widget.id === "nextTour")!.span).toBe(2);
  expect(saved!.find((widget) => widget.id === "activitySummary")!.visible).toBe(false);
  // La base reflète exactement l'ordre affiché après le glissement.
  const savedVisibleOrder = saved!.filter((widget) => widget.visible).map((widget) => `block-${widget.id}`);
  expect(savedVisibleOrder).toEqual(orderAfter);

  // Rechargement sans le paramètre : la disposition revient telle quelle, et
  // le tableau de bord n'est plus en mode personnalisation.
  await page.goto("/dashboard");
  await expect(page.getByText("Personnalisation en cours")).toHaveCount(0);
  await expect(page.getByText("Répartition des clients", { exact: false })).toHaveCount(0);
});

/**
 * Même filet de sécurité que pour la page de réservation : après avoir
 * réorganisé son tableau de bord, on doit pouvoir revenir à la disposition
 * d'origine.
 */
test("tout remettre d'origine efface la disposition enregistrée", async ({ page }) => {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`DELETE FROM "DashboardPreferences" WHERE "userId" IN (SELECT id FROM "User" WHERE email = ${EMAIL})`;

  await page.goto("/dashboard?personnaliser=1");
  await page.getByTestId("block-reminders").getByRole("button", { name: "Masquer" }).click();
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(page.getByText(/disposition du tableau de bord enregistrée/i)).toBeVisible({ timeout: 15000 });
  expect(await storedLayout(), "la personnalisation doit être enregistrée").not.toBeNull();

  await page.goto("/dashboard?personnaliser=1");
  await page.getByRole("button", { name: /tout remettre d’origine/i }).click();
  await page.getByRole("dialog").getByRole("button", { name: /tout remettre d’origine/i }).click();
  await expect(page.getByText(/disposition d’origine rétablie/i)).toBeVisible({ timeout: 15000 });

  expect(await storedLayout(), "plus aucune disposition enregistrée pour ce compte").toBeNull();

  // Et le bloc masqué est bien revenu.
  await page.goto("/dashboard");
  await expect(page.getByTestId("block-reminders")).toBeVisible({ timeout: 15000 });
});
