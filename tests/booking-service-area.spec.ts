import { expect, test, type Page } from "@playwright/test";
import { neon } from "./helpers/sql";
import { config } from "dotenv";

config({ path: ".env.local" });
const sql = neon(process.env.DATABASE_URL!);

/**
 * Secteur d'intervention (chantier C4, phase 2) : Rouen, 10 km. Un client du
 * Havre (~75 km) est prévenu, sans être bloqué ; la demande à domicile
 * venue de là porte une pastille « Hors secteur » côté professionnel.
 *
 * Le profil de démonstration est modifié le temps du test, puis rétabli.
 */
const SLUG = "pauline-faucillon";
const LE_HAVRE = { id: "76351_test", label: "1 Rue du Port 76600 Le Havre", houseNumber: "1", street: "Rue du Port", postcode: "76600", city: "Le Havre", citycode: "76351", latitude: 49.4944, longitude: 0.1079 };
const REQUEST_ID = "e2e-hors-secteur";

let saved: Record<string, unknown> | null = null;

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  const [row] = await sql`SELECT "serviceAreaLabel", "serviceAreaLatitude", "serviceAreaLongitude", "serviceAreaRadiusKm", location, "practiceMode"::text AS "practiceMode" FROM "BusinessProfile" WHERE slug = ${SLUG}`;
  saved = row;
  await sql`UPDATE "BusinessProfile" SET "serviceAreaLabel" = 'Rouen', "serviceAreaLatitude" = 49.4431, "serviceAreaLongitude" = 1.0993, "serviceAreaRadiusKm" = 10,
    location = 'Se déplace jusqu’à 10 km autour de Rouen', "practiceMode" = 'BOTH' WHERE slug = ${SLUG}`;
});

test.afterAll(async () => {
  await sql`DELETE FROM "Appointment" WHERE id = ${REQUEST_ID}`;
  if (!saved) return;
  await sql`UPDATE "BusinessProfile" SET "serviceAreaLabel" = ${saved.serviceAreaLabel as string | null}, "serviceAreaLatitude" = ${saved.serviceAreaLatitude as number | null},
    "serviceAreaLongitude" = ${saved.serviceAreaLongitude as number | null}, "serviceAreaRadiusKm" = ${saved.serviceAreaRadiusKm as number | null},
    location = ${saved.location as string}, "practiceMode" = ${saved.practiceMode as string}::"PracticeMode" WHERE slug = ${SLUG}`;
});

async function gotoAddressStep(page: Page) {
  await page.addInitScript(() => sessionStorage.clear());
  await page.goto(`/reserver/${SLUG}`);
  await expect(page.getByText("Quelle consultation souhaitez-vous")).toBeVisible();
  // L'en-tête nomme la commune de départ, et le secteur en clair.
  await expect(page.getByText("Basée à Rouen")).toBeVisible();
  await expect(page.getByText("Se déplace jusqu’à 10 km autour de Rouen").first()).toBeVisible();

  await page.locator("button[aria-pressed]").first().click();
  await page.getByRole("button", { name: "Consultation à domicile", exact: true }).click();
  await page.locator('button[type="submit"]').click();
  await expect(page.getByText("Choisissez votre créneau")).toBeVisible();
  await page.locator('[role="gridcell"][aria-disabled="false"]').first().click();
  await page.locator('button:has-text(":")').first().click();
  await page.locator('button[type="submit"]').click();
  await expect(page.getByText("Quelques informations")).toBeVisible();
  await page.fill('input[autocomplete="given-name"]', "Camille");
  await page.fill('input[autocomplete="family-name"]', "Horssecteur");
  await page.fill('input[autocomplete="tel"]', "0612345678");
  await page.locator('input[autocomplete="email"]').fill("hors-secteur@example.com");
  await page.locator('input[autocomplete="email"]').blur();
  return page.getByLabel("Adresse", { exact: false }).and(page.locator('input[role="combobox"]'));
}

test("une adresse au-delà du secteur est signalée au client, sans le bloquer", async ({ page }) => {
  await page.route("**/api/address-search**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ results: [LE_HAVRE] }) }));
  const input = await gotoAddressStep(page);
  await input.fill("1 rue du port");
  await page.getByRole("listbox").getByRole("option").first().click();

  const message = page.getByRole("status").filter({ hasText: "au-delà du secteur habituel" });
  await expect(message).toContainText(/Votre adresse est à environ \d+ km de Rouen, au-delà du secteur habituel \(10 km\)\. Vous pouvez envoyer votre demande/);
  // Non bloquant : on peut continuer.
  await expect(page.locator('button[type="submit"]')).toBeEnabled();
});

test("côté professionnel, la demande à domicile hors secteur porte une pastille", async ({ page }) => {
  const day = new Date(Date.now() + 9 * 24 * 3600_000).toISOString().slice(0, 10);
  await sql`DELETE FROM "Appointment" WHERE id = ${REQUEST_ID}`;
  await sql`INSERT INTO "Appointment" (id, date, start, duration, "clientName", "animalName", "serviceName", mode, location, price, status, notes, latitude, longitude, "updatedAt")
    VALUES (${REQUEST_ID}, ${`${day}T00:00:00.000Z`}, '11:00', 45, 'E2E Hors Secteur', 'Rex', 'Séance', 'DOMICILE', ${LE_HAVRE.label}, 70, 'PENDING', '', ${LE_HAVRE.latitude}, ${LE_HAVRE.longitude}, now())`;

  await sql`DELETE FROM "RateLimitEvent" WHERE key LIKE 'login:%'`;
  await page.goto("/login");
  await page.fill('input[type="email"]', "praticien-test@pf-osteo-animale.fr");
  await page.fill('input[type="password"]', "Praticien-Test-2026!");
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard**", { timeout: 15000 });

  await page.goto("/dashboard/agenda", { waitUntil: "networkidle" });
  const request = page.locator("article").filter({ hasText: "E2E Hors Secteur" });
  await expect(request).toContainText(/Hors secteur · \d+ km/);
});
