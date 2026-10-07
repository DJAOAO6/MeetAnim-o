import { expect, test } from "@playwright/test";
import { config } from "dotenv";
import { neon } from "./helpers/sql";

config({ path: ".env.local" });
const sql = neon(process.env.DATABASE_URL!);

/**
 * Cartes de prestation (PLAN-BOUTONS, 3.2) : l'état « Active » est un
 * interrupteur qui agit tout de suite, « Supprimer » est une corbeille qui
 * demande toujours confirmation.
 *
 * Le compte de test n'a pas le droit de modifier les prestations : il lui
 * est accordé le temps de la spec. Droit et état de la prestation rétablis à
 * la fin ; rien n'est supprimé.
 */
const PRACTITIONER_EMAIL = "praticien-test@pf-osteo-animale.fr";

let savedPermissions: string[] = [];
let service: { id: string; name: string; active: boolean };

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  const [account] = await sql`SELECT permissions FROM "User" WHERE email = ${PRACTITIONER_EMAIL}`;
  savedPermissions = (account?.permissions as string[] | undefined) ?? [];
  await sql`UPDATE "User" SET permissions = ARRAY['MANAGE_PUBLIC_SETTINGS'] WHERE email = ${PRACTITIONER_EMAIL}`;
  // La première prestation active de l'espace, dans l'ordre de l'écran.
  [service] = (await sql`SELECT id, name, active FROM "Service" WHERE "organizationId" = 'org-1002-pattes' AND active ORDER BY name ASC LIMIT 1`) as Array<typeof service>;
});

test.afterAll(async () => {
  await sql`UPDATE "Service" SET active = ${service.active} WHERE id = ${service.id}`;
  await sql`UPDATE "User" SET permissions = ${savedPermissions} WHERE email = ${PRACTITIONER_EMAIL}`;
});

test("l'interrupteur désactive puis réactive la prestation, sans autre confirmation", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/dashboard/prestations", { waitUntil: "networkidle" });
  const toggle = page.getByRole("switch", { name: `Prestation ${service.name} active` });
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  expect((await toggle.boundingBox())!.height, "cible de 44 px").toBeGreaterThanOrEqual(44);
  // Plus de bouton « Désactiver » : c'est l'interrupteur.
  await expect(page.getByRole("button", { name: "Désactiver", exact: true })).toHaveCount(0);

  await toggle.click();
  await expect(page.getByText("Prestation désactivée")).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  expect((await sql`SELECT active FROM "Service" WHERE id = ${service.id}`)[0].active).toBe(false);

  await toggle.click();
  await expect(page.getByText("Prestation activée")).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  expect((await sql`SELECT active FROM "Service" WHERE id = ${service.id}`)[0].active).toBe(true);
});

test("la corbeille demande confirmation ; annuler ne supprime rien", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/dashboard/prestations", { waitUntil: "networkidle" });
  const trash = page.getByRole("button", { name: `Supprimer ${service.name}`, exact: true });
  const box = (await trash.boundingBox())!;
  expect(Math.min(box.width, box.height), "corbeille de 44 px").toBeGreaterThanOrEqual(44);

  await trash.click();
  const confirm = page.getByRole("dialog", { name: "Supprimer cette prestation ?" });
  await expect(confirm).toContainText(service.name);
  await confirm.getByRole("button", { name: "Annuler" }).click();
  await expect(confirm).toHaveCount(0);
  expect((await sql`SELECT count(*)::int AS n FROM "Service" WHERE id = ${service.id}`)[0].n).toBe(1);

  // « Modifier » ouvre la fenêtre de la prestation.
  await page.getByRole("button", { name: "Modifier", exact: true }).first().click();
  await expect(page.getByRole("dialog").first()).toBeVisible();
});
