import { config } from "dotenv";
import { expect, test } from "@playwright/test";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.local" });

/**
 * Refonte tournées, prérequis 0.1 : le géocodage de l'adresse du cabinet ne
 * doit jamais bloquer l'enregistrement du profil. Une adresse introuvable
 * doit se solder par un avertissement non bloquant, pas par un échec ni par
 * une adresse silencieusement mal localisée.
 */

const testEmail = "praticien-test@pf-osteo-animale.fr";
const testPassword = "Praticien-Test-2026!";
const unresolvableCity = "Zzznonexistentplacexyz123";

type BusinessProfileRow = { id: string; address: string; postalCode: string; city: string; latitude: number | null; longitude: number | null };

let originalProfile: BusinessProfileRow | null = null;

async function grantPermission() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`UPDATE "User" SET permissions = ARRAY['MANAGE_PUBLIC_SETTINGS'] WHERE email = ${testEmail}`;
}

async function revokePermission() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`UPDATE "User" SET permissions = ARRAY[]::text[] WHERE email = ${testEmail}`;
}

test.describe("Profil — géocodage non bloquant de l'adresse du cabinet (Phase 0.1)", () => {
  test.beforeAll(async () => {
    await grantPermission();
    const sql = neon(process.env.DATABASE_URL!);
    const [row] = await sql`SELECT id, address, "postalCode", city, latitude, longitude FROM "BusinessProfile" LIMIT 1`;
    originalProfile = (row as BusinessProfileRow | undefined) ?? null;
  });

  test.afterAll(async () => {
    if (originalProfile) {
      const sql = neon(process.env.DATABASE_URL!);
      await sql`UPDATE "BusinessProfile" SET address = ${originalProfile.address}, "postalCode" = ${originalProfile.postalCode}, city = ${originalProfile.city}, latitude = ${originalProfile.latitude}, longitude = ${originalProfile.longitude} WHERE id = ${originalProfile.id}`;
    }
    await revokePermission();
  });

  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', testPassword);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard**", { timeout: 10000 });
    await page.goto("/dashboard/parametres");
    await page.waitForTimeout(600);
  });

  test("une adresse introuvable n'empêche pas l'enregistrement et affiche un avertissement, sans deviner de position", async ({ page }) => {
    await page.getByRole("combobox").fill(unresolvableCity);
    await page.getByLabel("Code postal").fill("00000");
    await page.getByLabel("Ville").fill(unresolvableCity);
    await page.getByRole("button", { name: "Enregistrer les modifications" }).click();

    await expect(page.getByText("Profil enregistré et visible sur votre page publique")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("L’adresse du cabinet n’a pas pu être localisée.")).toBeVisible();

    const sql = neon(process.env.DATABASE_URL!);
    const [row] = await sql`SELECT latitude, longitude FROM "BusinessProfile" WHERE id = ${originalProfile!.id}`;
    expect(row.latitude).toBeNull();
    expect(row.longitude).toBeNull();
  });
});
