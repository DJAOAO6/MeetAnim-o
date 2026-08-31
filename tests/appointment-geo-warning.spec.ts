import { config } from "dotenv";
import { expect, test, type Page, type Route } from "@playwright/test";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.local" });

/**
 * Refonte tournées, phase 3.3 : quand un rendez-vous à domicile est créé ou
 * déplacé, un bandeau avertit (sans jamais bloquer) si le temps de trajet
 * estimé jusqu'au rendez-vous voisin (précédent/suivant le même jour,
 * cabinet compris) dépasse l'écart réellement disponible entre les deux.
 */

const TEST_DATE = "2026-10-20"; // Mardi, hors de toute donnée de démonstration ou réelle connue
const TEST_DATE_NO_NEIGHBOR = "2026-10-21"; // Mercredi, aucun rendez-vous seedé ce jour-là
const NEIGHBOR_CLIENT_NAME = "E2E GeoWarning Neighbor";
const NEW_CLIENT_NAME = "E2E GeoWarning New";

// Très loin de n'importe quel cabinet normand plausible (Phase 0) : garantit
// un temps de trajet estimé très supérieur aux 15 minutes d'écart laissées
// par le rendez-vous voisin, sans dépendre des coordonnées réelles du
// cabinet en base.
const FAR_AWAY_ADDRESS = {
  id: "marseille-1",
  label: "1 Rue Test 13000 Marseille",
  houseNumber: "1",
  street: "Rue Test",
  postcode: "13000",
  city: "Marseille",
  citycode: "13055",
  latitude: 43.2965,
  longitude: 5.3698,
};

async function mockAddressSearch(page: Page) {
  await page.route("**/api/address-search**", async (route: Route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ results: [FAR_AWAY_ADDRESS] }) });
  });
}

async function seedNeighborAppointment() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`
    INSERT INTO "Appointment" (id, "clientName", "animalName", "serviceName", date, start, duration, mode, location, price, status, notes, "createdAt", "updatedAt")
    VALUES ('tmp-geo-warning-neighbor', ${NEIGHBOR_CLIENT_NAME}, ${NEIGHBOR_CLIENT_NAME}, 'Ostéopathie E2E', ${TEST_DATE}::date, '09:00', 60, 'CABINET', 'Cabinet', 60, 'CONFIRMED', '', now(), now())
  `;
}

async function cleanup() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`DELETE FROM "Appointment" WHERE "clientName" IN (${NEIGHBOR_CLIENT_NAME}, ${NEW_CLIENT_NAME})`;
}

async function login(page: Page) {
  await page.goto("/login");
  await page.fill('input[type="email"]', "praticien-test@pf-osteo-animale.fr");
  await page.fill('input[type="password"]', "Praticien-Test-2026!");
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard**", { timeout: 10000 });
}

async function openNewAppointmentForm(page: Page) {
  await page.goto("/dashboard/agenda");
  // Course d'hydratation connue (voir appointment-overlap.spec.ts) : un clic
  // immédiatement après goto() peut atterrir avant que React n'ait attaché
  // ses gestionnaires.
  await page.waitForTimeout(600);
  await page.getByRole("button", { name: "Nouveau rendez-vous", exact: true }).click();
  const dialog = page.locator('[role="dialog"]').first();
  await expect(dialog).toBeVisible();
  return dialog;
}

test.describe("Avertissement d'incompatibilité géographique (Phase 3.3)", () => {
  test.beforeEach(async () => {
    await cleanup();
    await seedNeighborAppointment();
  });

  test.afterEach(async () => {
    await cleanup();
  });

  test("avertit sans bloquer quand le trajet depuis le rendez-vous précédent dépasse l'écart disponible", async ({ page }) => {
    await mockAddressSearch(page);
    await login(page);
    const dialog = await openNewAppointmentForm(page);

    await dialog.getByPlaceholder("Nom du client, ou recherchez une fiche existante").fill(NEW_CLIENT_NAME);
    await dialog.getByPlaceholder("Nom de l’animal").fill(NEW_CLIENT_NAME);
    await dialog.locator('input[type="date"]').fill(TEST_DATE);
    // Le voisin (cabinet, 09:00-10:00) laisse 15 minutes avant ce rendez-vous.
    await dialog.locator('input[type="time"]').fill("10:15");
    await dialog.getByLabel("Durée").selectOption("30");
    await dialog.getByLabel("Mode").selectOption("home");

    const addressInput = dialog.getByLabel("Adresse", { exact: false }).and(dialog.locator('input[role="combobox"]'));
    await addressInput.fill("1 rue test marseille");
    await dialog.getByRole("listbox").getByRole("option").first().click();

    const warning = dialog.getByRole("alert").filter({ hasText: "Le rendez-vous précédent" });
    await expect(warning).toBeVisible({ timeout: 5000 });
    await expect(warning).toContainText("au cabinet");
    await expect(warning).toContainText("de route");
    await expect(warning).toContainText("entre les deux");

    // Purement indicatif : l'enregistrement doit tout de même réussir. Le
    // panneau reste ouvert après un enregistrement réussi (il bascule vers
    // la fiche récapitulative, voir global-appointments-manager.tsx) — la
    // vérité vérifiée ici est l'état réel en base, pas la fermeture d'un
    // dialogue (même convention que tests/appointment-overlap.spec.ts).
    await dialog.getByRole("button", { name: "Créer le rendez-vous" }).click();

    const sql = neon(process.env.DATABASE_URL!);
    async function fetchAppointment() {
      const rows = await sql`SELECT start, duration, mode, latitude, longitude FROM "Appointment" WHERE "clientName" = ${NEW_CLIENT_NAME}`;
      return rows[0] as { start: string; duration: number; mode: string; latitude: number | null; longitude: number | null } | undefined;
    }
    await expect.poll(fetchAppointment, { timeout: 5000 }).toMatchObject({ start: "10:15", mode: "DOMICILE" });
    const row = await fetchAppointment();
    expect(row!.latitude).toBeCloseTo(FAR_AWAY_ADDRESS.latitude, 3);
    expect(row!.longitude).toBeCloseTo(FAR_AWAY_ADDRESS.longitude, 3);
  });

  test("n'affiche aucun avertissement sans rendez-vous voisin le même jour", async ({ page }) => {
    await mockAddressSearch(page);
    await login(page);
    const dialog = await openNewAppointmentForm(page);

    await dialog.getByPlaceholder("Nom du client, ou recherchez une fiche existante").fill(NEW_CLIENT_NAME);
    await dialog.getByPlaceholder("Nom de l’animal").fill(NEW_CLIENT_NAME);
    // Aucun rendez-vous seedé ce jour-là : rien à comparer, même avec une
    // adresse très éloignée.
    await dialog.locator('input[type="date"]').fill(TEST_DATE_NO_NEIGHBOR);
    await dialog.locator('input[type="time"]').fill("07:00");
    await dialog.getByLabel("Durée").selectOption("30");
    await dialog.getByLabel("Mode").selectOption("home");

    const addressInput = dialog.getByLabel("Adresse", { exact: false }).and(dialog.locator('input[role="combobox"]'));
    await addressInput.fill("1 rue test marseille");
    await dialog.getByRole("listbox").getByRole("option").first().click();
    await page.waitForTimeout(700);

    await expect(dialog.getByRole("alert").filter({ hasText: "Le rendez-vous" })).toHaveCount(0);
  });
});
