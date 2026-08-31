import { config } from "dotenv";
import { expect, test, type Page } from "@playwright/test";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.local" });

/**
 * Refonte tournées, phase 1 : la page de détail d'une tournée doit afficher
 * un lien Google Maps réel, une distance/durée estimées à partir de vraies
 * coordonnées, et les trois actions par arrêt (Appeler, Y aller, Voir la
 * fiche) — remplace l'ancien écran purement descriptif.
 */

const testEmail = "praticien-test@pf-osteo-animale.fr";
const testPassword = "Praticien-Test-2026!";

const testZoneId = "tmp-p1-zone";
const testTourId = "tmp-p1-tour";
const clientAId = "tmp-p1-client-a";
const clientBId = "tmp-p1-client-b";
const animalAId = "tmp-p1-animal-a";
const animalBId = "tmp-p1-animal-b";
const appointmentAId = "tmp-p1-appt-a";
const appointmentBId = "tmp-p1-appt-b";
const animalAName = "P1StopAnimalA";
const animalBName = "P1StopAnimalB";
const weekdayLabels = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];

function todayDateId(): string {
  return new Date().toISOString().slice(0, 10);
}

async function grantPermission() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`UPDATE "User" SET permissions = ARRAY['MANAGE_PUBLIC_SETTINGS'] WHERE email = ${testEmail}`;
}

async function revokePermission() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`UPDATE "User" SET permissions = ARRAY[]::text[] WHERE email = ${testEmail}`;
}

async function seed() {
  const sql = neon(process.env.DATABASE_URL!);
  const today = new Date();
  const todayLabel = weekdayLabels[today.getDay()];

  await sql`INSERT INTO "Zone" (id, name) VALUES (${testZoneId}, 'Zone E2E Itinéraire P1')`;
  await sql`INSERT INTO "City" (id, name, "postalCode", "zoneId") VALUES ('tmp-p1-city-a', 'VilleTestP1A', '76200', ${testZoneId})`;
  await sql`INSERT INTO "City" (id, name, "postalCode", "zoneId") VALUES ('tmp-p1-city-b', 'VilleTestP1B', '76550', ${testZoneId})`;
  await sql`
    INSERT INTO "Tour" (id, name, recurrence, day, "dateLabel", "startTime", "endTime", "zoneId", status)
    VALUES (${testTourId}, 'Tournée E2E Itinéraire P1', 'Toutes les semaines', ${todayLabel}, 'test', '08:00', '20:00', ${testZoneId}, 'ACTIVE')
  `;

  await sql`INSERT INTO "Client" (id, "firstName", "lastName", phone, email, city, address, "updatedAt") VALUES (${clientAId}, 'Prénom', 'E2EItineraireP1A', '06 12 34 56 78', 'p1-itineraire-a@example.fr', 'VilleTestP1A', '1 rue Test', now())`;
  await sql`INSERT INTO "Client" (id, "firstName", "lastName", phone, email, city, address, "updatedAt") VALUES (${clientBId}, 'Prénom', 'E2EItineraireP1B', '', 'p1-itineraire-b@example.fr', 'VilleTestP1B', '2 rue Test', now())`;
  await sql`INSERT INTO "Animal" (id, "clientId", name, species, breed, age, weight, sex, avatar, "avatarBackground", history, conditions, treatments, notes, "updatedAt") VALUES (${animalAId}, ${clientAId}, ${animalAName}, 'Chien', '', '', '', '', '', '', '', '', '', '', now())`;
  await sql`INSERT INTO "Animal" (id, "clientId", name, species, breed, age, weight, sex, avatar, "avatarBackground", history, conditions, treatments, notes, "updatedAt") VALUES (${animalBId}, ${clientBId}, ${animalBName}, 'Chat', '', '', '', '', '', '', '', '', '', '', now())`;

  await sql`
    INSERT INTO "Appointment" (id, "clientId", "animalId", "clientName", "animalName", "serviceName", date, start, duration, mode, location, "postalCode", city, latitude, longitude, price, status, notes, "createdAt", "updatedAt")
    VALUES (${appointmentAId}, ${clientAId}, ${animalAId}, 'Prénom E2EItineraireP1A', ${animalAName}, 'Ostéopathie E2E P1', ${todayDateId()}::date, '09:00', 60, 'DOMICILE', 'VilleTestP1A', '76200', 'VilleTestP1A', 49.9219, 1.0771, 80, 'CONFIRMED', '', now(), now())
  `;
  await sql`
    INSERT INTO "Appointment" (id, "clientId", "animalId", "clientName", "animalName", "serviceName", date, start, duration, mode, location, "postalCode", city, latitude, longitude, price, status, notes, "createdAt", "updatedAt")
    VALUES (${appointmentBId}, ${clientBId}, ${animalBId}, 'Prénom E2EItineraireP1B', ${animalBName}, 'Ostéopathie E2E P1', ${todayDateId()}::date, '11:00', 60, 'DOMICILE', 'VilleTestP1B', '76550', 'VilleTestP1B', 49.8994, 1.0499, 80, 'CONFIRMED', '', now(), now())
  `;
}

async function cleanup() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`DELETE FROM "Appointment" WHERE id IN (${appointmentAId}, ${appointmentBId})`;
  await sql`DELETE FROM "Animal" WHERE id IN (${animalAId}, ${animalBId})`;
  await sql`DELETE FROM "Client" WHERE id IN (${clientAId}, ${clientBId})`;
  await sql`DELETE FROM "Tour" WHERE id = ${testTourId}`;
  await sql`DELETE FROM "City" WHERE "zoneId" = ${testZoneId}`;
  await sql`DELETE FROM "Zone" WHERE id = ${testZoneId}`;
}

async function login(page: Page) {
  await page.goto("/login");
  await page.fill('input[type="email"]', testEmail);
  await page.fill('input[type="password"]', testPassword);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard**", { timeout: 10000 });
}

async function openTourDetail(page: Page) {
  await page.goto("/dashboard/tournees");
  await page.waitForTimeout(600);
  const heading = page.getByText("Tournée E2E Itinéraire P1", { exact: true });
  await heading.scrollIntoViewIfNeeded();
  const card = heading.locator("xpath=ancestor::*[contains(@class,'rounded-')][1]");
  await card.getByRole("button", { name: "Voir la journée" }).click();
  await expect(page.getByText(animalAName, { exact: true })).toBeVisible();
}

test.describe("Détail de tournée — itinéraire réel et actions par arrêt (Phase 1)", () => {
  test.beforeAll(async () => {
    await grantPermission();
  });

  test.afterAll(async () => {
    await cleanup();
    await revokePermission();
  });

  test.beforeEach(async ({ page }) => {
    await cleanup();
    await seed();
    await login(page);
  });

  test("affiche un lien Maps réel, une distance estimée, et les actions Appeler/Y aller/Voir la fiche", async ({ page }) => {
    await openTourDetail(page);

    const mapsLink = page.getByRole("link", { name: "Ouvrir l’itinéraire complet" });
    await expect(mapsLink).toBeVisible();
    const href = await mapsLink.getAttribute("href");
    expect(href).toContain("https://www.google.com/maps/dir/?api=1");
    expect(href).toContain("origin=");
    expect(href).toContain("destination=");
    expect(mapsLink).toHaveAttribute("target", "_blank");

    await expect(page.getByText(/^≈ \d+ km/)).toBeVisible();

    const stopA = page.getByText(animalAName, { exact: true }).locator("xpath=ancestor::article[1]");
    await expect(stopA.getByRole("link", { name: "Appeler" })).toHaveAttribute("href", "tel:+33612345678");
    await expect(stopA.getByRole("link", { name: "Y aller" })).toHaveAttribute("target", "_blank");
    await expect(stopA.getByRole("link", { name: "Voir la fiche" })).toHaveAttribute("href", `/dashboard/clients/${clientAId}?animal=${animalAId}`);

    // Client B n'a pas de téléphone : le bouton Appeler doit être absent, pas grisé.
    const stopB = page.getByText(animalBName, { exact: true }).locator("xpath=ancestor::article[1]");
    await expect(stopB.getByRole("link", { name: "Appeler" })).toHaveCount(0);
    await expect(stopB.getByRole("link", { name: "Y aller" })).toBeVisible();
  });

  test("reste utilisable sur mobile (380px) : une carte par arrêt, actions pleine largeur", async ({ page }) => {
    await page.setViewportSize({ width: 380, height: 800 });
    await openTourDetail(page);

    const stopA = page.getByText(animalAName, { exact: true }).locator("xpath=ancestor::article[1]");
    await expect(stopA).toBeVisible();

    const callButton = stopA.getByRole("link", { name: "Appeler" });
    await expect(callButton).toBeVisible();
    const box = await callButton.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);

    // Pas de scroll horizontal de la page à 380px.
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(380 + 1);
  });
});
