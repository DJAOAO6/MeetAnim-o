import { config } from "dotenv";
import { expect, test } from "@playwright/test";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.local" });

/**
 * Refonte page publique de réservation, étape 3 : badges dynamiques,
 * bascules d'affichage, copier l'adresse, lien itinéraire, non-régression
 * du tunnel de réservation lui-même.
 */

type ProfileRow = {
  id: string;
  slug: string;
  tagline: string | null;
  showAddressPublicly: boolean;
  showHoursPublicly: boolean;
  showPhonePublicly: boolean;
};

let original: ProfileRow | null = null;

async function loadOriginal(): Promise<ProfileRow> {
  const sql = neon(process.env.DATABASE_URL!);
  const [row] = await sql`SELECT id, slug, tagline, "showAddressPublicly", "showHoursPublicly", "showPhonePublicly" FROM "BusinessProfile" LIMIT 1`;
  return row as ProfileRow;
}

async function restoreOriginal() {
  if (!original) return;
  const sql = neon(process.env.DATABASE_URL!);
  await sql`UPDATE "BusinessProfile" SET tagline = ${original.tagline}, "showAddressPublicly" = ${original.showAddressPublicly}, "showHoursPublicly" = ${original.showHoursPublicly}, "showPhonePublicly" = ${original.showPhonePublicly} WHERE id = ${original.id}`;
}

test.describe("Page publique de réservation — profil professionnel", () => {
  test.beforeAll(async () => {
    original = await loadOriginal();
  });
  test.afterAll(restoreOriginal);

  test("affiche les badges dynamiques, l'adresse avec carte, les horaires réels, et le tunnel reste accessible", async ({ page }) => {
    await page.goto(`/reserver/${original!.slug}`);

    await expect(page.locator("h1")).toBeVisible({ timeout: 10000 });
    await expect(page.locator("h1")).not.toBeEmpty();
    await expect(page.getByText("Cabinet", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Adresse du cabinet" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Horaires" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Voir l’itinéraire" })).toHaveAttribute("href", /google\.com\/maps/);

    // Le tunnel de réservation reste utilisable à côté de la nouvelle sidebar.
    await expect(page.getByRole("heading", { name: "Quelle consultation souhaitez-vous ?" })).toBeVisible();
  });

  test("copier l'adresse affiche un retour visuel", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto(`/reserver/${original!.slug}`);

    await page.getByRole("button", { name: "Copier l’adresse" }).click();
    await expect(page.getByText("Adresse copiée")).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole("button", { name: "Adresse copiée ✓" })).toBeVisible();
  });

  test("désactiver une bascule d'affichage masque bien l'information correspondante sur la page publique", async ({ page }) => {
    const sql = neon(process.env.DATABASE_URL!);
    await sql`UPDATE "BusinessProfile" SET "showAddressPublicly" = false, "showHoursPublicly" = false WHERE id = ${original!.id}`;

    await page.goto(`/reserver/${original!.slug}`);

    await expect(page.getByRole("heading", { name: "Adresse du cabinet" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Horaires" })).toHaveCount(0);
    // Le reste du profil (badges, prestations) reste affiché normalement.
    await expect(page.getByText("Cabinet", { exact: true })).toBeVisible();
  });
});
