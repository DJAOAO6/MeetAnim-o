import { config } from "dotenv";
import { expect, test } from "@playwright/test";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.local" });

/**
 * Refonte page publique de réservation, étape 1 : nouvel onglet Paramètres
 * "Profil public" (tagline, réseaux, infos pratiques, bascules d'affichage).
 */

const testEmail = "praticien-test@pf-osteo-animale.fr";
const testPassword = "Praticien-Test-2026!";
const testTagline = "Ostéopathe animalier diplômée et certifiée — E2E";

type PublicProfileRow = { id: string; tagline: string | null; cabinetName: string | null; acceptedPayments: string | null; showPhonePublicly: boolean };

let originalProfile: PublicProfileRow | null = null;

async function grantPermission() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`UPDATE "User" SET permissions = ARRAY['MANAGE_PUBLIC_SETTINGS'] WHERE email = ${testEmail}`;
}

async function revokePermission() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`UPDATE "User" SET permissions = ARRAY[]::text[] WHERE email = ${testEmail}`;
}

test.describe("Paramètres — onglet Profil public", () => {
  test.beforeAll(async () => {
    await grantPermission();
    const sql = neon(process.env.DATABASE_URL!);
    const [row] = await sql`SELECT id, tagline, "cabinetName", "acceptedPayments", "showPhonePublicly" FROM "BusinessProfile" LIMIT 1`;
    originalProfile = (row as PublicProfileRow | undefined) ?? null;
  });

  test.afterAll(async () => {
    if (originalProfile) {
      const sql = neon(process.env.DATABASE_URL!);
      await sql`UPDATE "BusinessProfile" SET tagline = ${originalProfile.tagline}, "cabinetName" = ${originalProfile.cabinetName}, "acceptedPayments" = ${originalProfile.acceptedPayments}, "showPhonePublicly" = ${originalProfile.showPhonePublicly} WHERE id = ${originalProfile.id}`;
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

  test("modifier la phrase d'accroche, le nom du cabinet, les paiements et une bascule d'affichage persiste réellement en base", async ({ page }) => {
    await page.getByRole("button", { name: "Profil public" }).click();

    await page.getByLabel("Phrase d’accroche").fill(testTagline);
    await page.getByLabel("Nom du cabinet").fill("Centre Rivada E2E");
    await page.getByLabel("Moyens de paiement acceptés").fill("Chèque, espèces ou virement");
    await page.getByRole("switch", { name: "Afficher mon téléphone" }).click();

    await page.getByRole("button", { name: "Enregistrer les modifications" }).click();
    await expect(page.getByText("Profil public enregistré et visible sur votre page de réservation")).toBeVisible({ timeout: 10000 });

    const sql = neon(process.env.DATABASE_URL!);
    const [row] = await sql`SELECT tagline, "cabinetName", "acceptedPayments", "showPhonePublicly" FROM "BusinessProfile" WHERE id = ${originalProfile!.id}`;
    expect(row.tagline).toBe(testTagline);
    expect(row.cabinetName).toBe("Centre Rivada E2E");
    expect(row.acceptedPayments).toBe("Chèque, espèces ou virement");
    expect(row.showPhonePublicly).toBe(!originalProfile!.showPhonePublicly);
  });
});
