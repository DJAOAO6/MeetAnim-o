import { config } from "dotenv";
import { expect, test, type Page } from "@playwright/test";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.local" });

/**
 * Intégrations calendrier — Paramètres → Intégrations. La connexion Google
 * elle-même n'est pas testée ici (nécessiterait de simuler le serveur OAuth
 * de Google) : ces tests couvrent l'état déconnecté (rendu, lien correct)
 * et le flux Apple Calendar (abonnement ICS), qui ne dépend d'aucun service
 * externe et peut être vérifié de bout en bout.
 */

const testEmail = "praticien-test@pf-osteo-animale.fr";
const testPassword = "Praticien-Test-2026!";

async function clearLoginRateLimit() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`DELETE FROM "RateLimitEvent" WHERE key LIKE 'login:%'`;
}

async function clearIcsFeedToken() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`UPDATE "User" SET "icsFeedToken" = NULL WHERE email = ${testEmail}`;
}

async function login(page: Page) {
  await page.goto("/login");
  await page.fill('input[type="email"]', testEmail);
  await page.fill('input[type="password"]', testPassword);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard**", { timeout: 10000 });
}

async function openIntegrationsTab(page: Page) {
  await page.goto("/dashboard/parametres");
  await page.waitForTimeout(600);
  await page.getByRole("button", { name: "Intégrations", exact: true }).click();
}

test.describe("Paramètres — Intégrations calendrier", () => {
  test.beforeEach(async () => {
    await clearLoginRateLimit();
    await clearIcsFeedToken();
  });

  test.afterEach(async () => {
    await clearIcsFeedToken();
  });

  test("Google Agenda affiche l'état déconnecté avec le bon lien de connexion", async ({ page }) => {
    await login(page);
    await openIntegrationsTab(page);

    const connectLink = page.getByRole("link", { name: "Connecter Google Agenda" });
    await expect(connectLink).toBeVisible();
    await expect(connectLink).toHaveAttribute("href", "/api/calendar/google/connect");
    await expect(page.getByText("Connecté", { exact: true })).toHaveCount(0);
  });

  test("Apple Calendar : générer, servir un flux .ics valide, régénérer puis désactiver le lien", async ({ page, request }) => {
    await login(page);
    await openIntegrationsTab(page);

    const enableButton = page.getByRole("button", { name: "Ajouter à Apple Calendar" });
    await expect(enableButton).toBeVisible();
    await enableButton.click();

    const urlInput = page.locator('input[readonly]');
    await expect(urlInput).toBeVisible();
    const firstUrl = await urlInput.inputValue();
    expect(firstUrl).toMatch(/\/api\/calendar\/feed\/.+\.ics$/);

    const feedResponse = await request.get(firstUrl);
    expect(feedResponse.ok()).toBe(true);
    expect(feedResponse.headers()["content-type"]).toContain("text/calendar");
    const body = await feedResponse.text();
    expect(body).toContain("BEGIN:VCALENDAR");
    expect(body).toContain("END:VCALENDAR");

    await page.getByRole("button", { name: "Régénérer le lien" }).click();
    await expect(urlInput).not.toHaveValue(firstUrl);
    const secondUrl = await urlInput.inputValue();
    expect(secondUrl).toMatch(/\/api\/calendar\/feed\/.+\.ics$/);

    // L'ancien lien ne fonctionne plus après régénération.
    const staleResponse = await request.get(firstUrl);
    expect(staleResponse.status()).toBe(404);

    await page.getByRole("button", { name: "Désactiver le lien" }).click();
    await expect(page.getByRole("button", { name: "Ajouter à Apple Calendar" })).toBeVisible();

    const disabledResponse = await request.get(secondUrl);
    expect(disabledResponse.status()).toBe(404);
  });
});
