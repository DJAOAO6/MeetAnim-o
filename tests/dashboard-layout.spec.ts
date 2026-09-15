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

  await page.getByRole("button", { name: /personnaliser mon tableau de bord/i }).click();

  // Redimensionnement : « Prochaine tournée » passe de 1 à 2 colonnes.
  const tourWidth = page.getByRole("group", { name: /largeur du bloc prochaine tournée/i });
  await tourWidth.getByRole("button", { name: "2", exact: true }).click();

  // Masquage : le résumé d'activité rejoint le panneau « Ajouter un bloc ».
  await page.getByTestId("block-activitySummary").getByRole("button", { name: "Masquer" }).click();

  // Réordonnancement à la souris depuis la poignée : « Chiffres clés »
  // descend sur la position du planning.
  const handle = page.getByRole("button", { name: /déplacer le bloc chiffres clés/i });
  await handle.scrollIntoViewIfNeeded();
  await handle.hover();
  const handleBox = (await handle.boundingBox())!;
  const target = (await page.getByTestId("block-planning").boundingBox())!;
  await page.mouse.down();
  // Plusieurs pas : dnd-kit n'arme le déplacement qu'au-delà de quelques
  // pixels, et calcule la cible au fil des positions traversées.
  for (let step = 1; step <= 8; step += 1) {
    await page.mouse.move(target.x + target.width / 2, handleBox.y + ((target.y - handleBox.y) * step) / 8);
    await page.waitForTimeout(40);
  }
  await page.mouse.up();
  await page.waitForTimeout(300);

  // Accessibilité : le même déplacement doit être possible au clavier seul.
  const tourHandle = page.getByRole("button", { name: /déplacer le bloc prochaine tournée/i });
  await tourHandle.focus();
  await page.keyboard.press("Space");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("Space");
  await page.waitForTimeout(300);

  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(page.getByTestId("save-status")).toHaveText(/disposition enregistrée/i, { timeout: 10000 });

  const saved = await storedLayout();
  expect(saved, "la disposition doit être enregistrée en base pour ce compte").not.toBeNull();
  expect(saved!.find((widget) => widget.id === "nextTour")!.span).toBe(2);
  expect(saved!.find((widget) => widget.id === "activitySummary")!.visible).toBe(false);
  // Réordonnancement effectif : « Chiffres clés » n'est plus en deuxième
  // position, où le catalogue le place par défaut.
  expect(saved!.findIndex((widget) => widget.id === "stats")).not.toBe(1);

  // Rechargement : la disposition revient telle quelle, sans personnalisation en cours.
  await page.reload();
  await expect(page.getByRole("button", { name: /personnaliser mon tableau de bord/i })).toBeVisible();
  await expect(page.getByText("Répartition des clients", { exact: false })).toHaveCount(0);
});
