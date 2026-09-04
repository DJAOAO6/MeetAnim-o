import { config } from "dotenv";
import { expect, test } from "@playwright/test";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.local" });

/**
 * Chantier Tournées T0.1 : un client créé (ou modifié) depuis une adresse
 * réelle est géocodé automatiquement, sans passer par le bouton "localiser"
 * manuel — via after() (non bloquant, après la réponse), d'où le sondage de
 * la base ci-dessous plutôt qu'une assertion immédiate après la fermeture du
 * formulaire.
 */

const testEmail = "praticien-test@pf-osteo-animale.fr";
const testPassword = "Praticien-Test-2026!";
const testClientLastName = "E2EAutoGeoTest";
const testClientFirstName = "Prénom";

async function cleanupTestClient() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`DELETE FROM "Client" WHERE "lastName" = ${testClientLastName}`;
}

async function clearLoginRateLimit() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`DELETE FROM "RateLimitEvent" WHERE key LIKE 'login:%'`;
}

async function pollGeocodedClient(lastName: string, timeoutMs = 10000) {
  const sql = neon(process.env.DATABASE_URL!);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const [row] = await sql`SELECT latitude, longitude, "geocodedAt" FROM "Client" WHERE "lastName" = ${lastName}`;
    if (row?.geocodedAt) return row as { latitude: number | null; longitude: number | null; geocodedAt: string };
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error("Le client n'a jamais été géocodé (geocodedAt toujours nul après le délai).");
}

test.describe("Clients — géocodage automatique à l'écriture (Chantier Tournées T0.1)", () => {
  test.beforeEach(async ({ page }) => {
    await cleanupTestClient();
    await clearLoginRateLimit();
    await page.goto("/login");
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', testPassword);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard**", { timeout: 10000 });
  });

  test.afterEach(async () => {
    await cleanupTestClient();
  });

  test("créer un client avec une adresse réelle le géocode automatiquement, sans bouton manuel", async ({ page }) => {
    await page.goto("/dashboard/clients");
    await page.waitForTimeout(600);
    await page.getByRole("button", { name: "Nouveau client" }).click();
    const dialog = page.locator('section[role="dialog"]');
    await dialog.getByLabel("Prénom").fill(testClientFirstName);
    await dialog.getByLabel("Nom", { exact: true }).fill(testClientLastName);
    await dialog.getByLabel("Téléphone").fill("0612345678");
    await dialog.getByLabel("Ville").fill("Paris");
    await dialog.getByLabel("Adresse").fill("10 Rue de la Paix");
    await dialog.getByRole("button", { name: "Créer le client" }).click();
    await expect(dialog).toHaveCount(0, { timeout: 10000 });

    const geocoded = await pollGeocodedClient(testClientLastName);
    expect(geocoded.latitude).not.toBeNull();
    expect(geocoded.longitude).not.toBeNull();
    // Paris, pas la position par défaut de la carte simulée (Rouen).
    expect(geocoded.latitude).toBeGreaterThan(48.7);
    expect(geocoded.latitude).toBeLessThan(49.1);
  });
});
