import { config } from "dotenv";
import { expect, test, type Page } from "@playwright/test";
import { neon } from "./helpers/sql";

config({ path: ".env.local" });

/**
 * Carte clients, phase 6 : un client sans position se localise depuis la
 * liste, avec une position précise enregistrée comme telle — recherche
 * complète au géocodeur IGN (vrai service), code postal en filtre.
 */

const testEmail = "praticien-test@pf-osteo-animale.fr";
const testPassword = "Praticien-Test-2026!";
const CLIENT_ID = "tmp-locate-client";

async function cleanup() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`DELETE FROM "Animal" WHERE "clientId" = ${CLIENT_ID}`;
  await sql`DELETE FROM "Client" WHERE id = ${CLIENT_ID}`;
}

async function login(page: Page) {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`DELETE FROM "RateLimitEvent" WHERE key LIKE 'login:%'`;
  await page.goto("/login");
  await page.fill('input[type="email"]', testEmail);
  await page.fill('input[type="password"]', testPassword);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard**", { timeout: 10000 });
}

test.describe("Carte clients — localiser un client", () => {
  test.beforeAll(async () => {
    await cleanup();
    const sql = neon(process.env.DATABASE_URL!);
    // Adresse réelle (numéro connu de la Base Adresse Nationale), sans position.
    await sql`INSERT INTO "Client" (id, "firstName", "lastName", phone, email, city, address, "postalCode", "updatedAt") VALUES (${CLIENT_ID}, 'Test', 'LocaliserE2E', '0600000011', 'locate-e2e@example.fr', 'Le Havre', '16 rue de Paris', '76600', now())`;
  });
  test.afterAll(cleanup);

  test("« Localiser » place le client, avec une position précise", async ({ page }) => {
    await login(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/dashboard/carte", { waitUntil: "networkidle" });
    const row = page.locator(`[data-client-row="${CLIENT_ID}"]`);
    await expect(row).toContainText("Position inconnue");

    await row.getByRole("button").first().click();
    await row.getByRole("button", { name: "Localiser", exact: true }).click();
    await expect(page.getByText("Test LocaliserE2E est localisé sur la carte.")).toBeVisible({ timeout: 20000 });

    const sql = neon(process.env.DATABASE_URL!);
    const [client] = await sql`SELECT latitude, longitude, "geocodePrecision" FROM "Client" WHERE id = ${CLIENT_ID}`;
    expect(client.geocodePrecision, "numéro trouvé : position exacte").toBe("EXACT");
    // 16 rue de Paris, Le Havre : à quelques centaines de mètres de l'hôtel de ville.
    expect(Math.abs(client.latitude - 49.49)).toBeLessThan(0.02);
    expect(Math.abs(client.longitude - 0.107)).toBeLessThan(0.03);

    // Après rechargement, il n'est plus « sans position ».
    await expect(row).not.toContainText("Position inconnue", { timeout: 15000 });
  });
});
