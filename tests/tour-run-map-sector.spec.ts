import { randomBytes } from "node:crypto";
import { config } from "dotenv";
import { expect, test, type Page } from "@playwright/test";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.local" });

/**
 * Carte de tournée comme plan de travail (unification des tournées, phase 3
 * bis) : calque clients filtré par secteur (zone du motif) et géocodage à la
 * demande d'un client sans position — jamais de repli par ville (voir
 * coordinatesForCity, retiré de getMapClients en phase 3 bis). Date de test
 * fixe et éloignée (2027) pour ne jamais entrer en collision avec une vraie
 * tournée créée par la praticienne pendant que ce test tourne.
 */

const testEmail = "praticien-test@pf-osteo-animale.fr";
const testPassword = "Praticien-Test-2026!";
const testDateId = "2027-03-19"; // vendredi, sans lien avec une vraie tournée
const testOwnerLastName = "E2ESectorMapTest";
const testZoneName = "Zone E2E Secteur Carte";
const testTourName = "Tournée E2E Secteur Carte";
const testCity = "Rouen";

function fakeCuid(): string {
  return `c${randomBytes(12).toString("hex")}`;
}

async function seedZoneAndTour(): Promise<{ zoneId: string; tourId: string }> {
  const sql = neon(process.env.DATABASE_URL!);
  const zoneId = fakeCuid();
  const tourId = fakeCuid();
  await sql`INSERT INTO "Zone" (id, name) VALUES (${zoneId}, ${testZoneName})`;
  await sql`INSERT INTO "City" (id, name, "postalCode", "zoneId") VALUES (${fakeCuid()}, ${testCity}, '76000', ${zoneId})`;
  await sql`
    INSERT INTO "Tour" (id, name, recurrence, day, "dateLabel", "startTime", "endTime", "zoneId", status)
    VALUES (${tourId}, ${testTourName}, 'Toutes les semaines', 'Vendredi', 'Tous les vendredis', '09:00', '18:00', ${zoneId}, 'ACTIVE')
  `;
  await sql`INSERT INTO "_TourZones" ("A", "B") VALUES (${tourId}, ${zoneId})`;
  return { zoneId, tourId };
}

async function seedTourRun(userEmail: string, templateId: string): Promise<string> {
  const sql = neon(process.env.DATABASE_URL!);
  const tourRunId = fakeCuid();
  await sql`
    INSERT INTO "TourRun" (id, "userId", date, name, "templateId", "startType", "startAddress", "startLatitude", "startLongitude", "endType", "endAddress", "endLatitude", "endLongitude", "createdAt", "updatedAt")
    SELECT ${tourRunId}, u.id, ${testDateId}::date, ${"Tournée " + testOwnerLastName}, ${templateId}, 'CABINET', 'Cabinet', 49.44, 1.09, 'CABINET', 'Cabinet', 49.44, 1.09, now(), now()
    FROM "User" u WHERE u.email = ${userEmail}
  `;
  return tourRunId;
}

async function seedUnlocatedClient(): Promise<string> {
  const sql = neon(process.env.DATABASE_URL!);
  const clientId = fakeCuid();
  // Adresse réelle et repérable (place bien connue de Rouen) pour un
  // géocodage IGN fiable côté test — pas de latitude/longitude posées ici :
  // c'est justement le point testé (le bouton "Localiser" doit les poser).
  await sql`INSERT INTO "Client" (id, "firstName", "lastName", phone, email, city, address, "updatedAt") VALUES (${clientId}, 'Prénom', ${testOwnerLastName}, '0611223344', 'e2e-sector-map@example.fr', ${testCity}, '1 place du Vieux Marché', now())`;
  await sql`INSERT INTO "Animal" (id, "clientId", name, species, breed, age, weight, sex, avatar, "avatarBackground", history, conditions, treatments, notes, "updatedAt") VALUES (${fakeCuid()}, ${clientId}, 'RexSectorMap', 'Chien', '', '', '', '', '', '', '', '', '', '', now())`;
  return clientId;
}

async function cleanup() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`DELETE FROM "TourRun" WHERE date = ${testDateId}::date AND name LIKE ${"%" + testOwnerLastName + "%"}`;
  await sql`DELETE FROM "Animal" WHERE name = 'RexSectorMap'`;
  await sql`DELETE FROM "Client" WHERE "lastName" = ${testOwnerLastName}`;
  await sql`DELETE FROM "Tour" WHERE name = ${testTourName}`;
  await sql`DELETE FROM "Zone" WHERE name = ${testZoneName}`;
}

async function clearLoginRateLimit() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`DELETE FROM "RateLimitEvent" WHERE key LIKE 'login:%'`;
}

async function login(page: Page) {
  await page.goto("/login");
  await page.fill('input[type="email"]', testEmail);
  await page.fill('input[type="password"]', testPassword);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard**", { timeout: 10000 });
}

test.describe("Carte de tournée — calque clients du secteur", () => {
  test.beforeEach(async () => {
    await clearLoginRateLimit();
    await cleanup();
  });

  test.afterEach(async () => {
    await cleanup();
  });

  test("liste un client du secteur sans adresse localisée et persiste sa position au clic sur Localiser", async ({ page }) => {
    const { tourId } = await seedZoneAndTour();
    await seedTourRun(testEmail, tourId);
    const clientId = await seedUnlocatedClient();
    await login(page);

    await page.goto(`/dashboard/tournees?date=${testDateId}`);
    await expect(page.getByText(`Tournée ${testOwnerLastName}`)).toBeVisible({ timeout: 10000 });

    await page.getByRole("button", { name: /Afficher les clients du secteur/ }).click();

    const unlocatedRow = page.locator("li", { hasText: "RexSectorMap" });
    await expect(unlocatedRow).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Clients du secteur sans adresse localisée")).toBeVisible();

    await unlocatedRow.getByRole("button", { name: "Localiser" }).click();
    await expect(page.getByText(/Adresse localisée/)).toBeVisible({ timeout: 15000 });

    // La position doit être réellement persistée en base (pas seulement un
    // état local disparu de l'écran) — vérification de l'état réel, pas
    // seulement du DOM.
    const sql = neon(process.env.DATABASE_URL!);
    const rows = await sql`SELECT latitude, longitude FROM "Client" WHERE id = ${clientId}`;
    expect(rows[0]?.latitude).not.toBeNull();
    expect(rows[0]?.longitude).not.toBeNull();

    // Une fois localisé, il quitte la liste "sans adresse localisée" — il
    // rejoint le calque carte normal, plus la liste d'exception (d'autres
    // vrais clients non localisés du même secteur peuvent y rester).
    await expect(page.locator("li", { hasText: "RexSectorMap" })).toHaveCount(0, { timeout: 10000 });
  });
});
