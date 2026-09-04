import { randomBytes } from "node:crypto";
import { config } from "dotenv";
import { expect, test, type Page } from "@playwright/test";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.local" });

/**
 * Éditeur de tournées interactif (carte MapLibre + timeline). Utilise une
 * date de test fixe et éloignée (2027) pour ne jamais entrer en collision
 * avec de vraies tournées créées par la praticienne pendant que ce test
 * tourne — voir cleanupTestData, appelé avant ET après.
 */

const testEmail = "praticien-test@pf-osteo-animale.fr";
const testPassword = "Praticien-Test-2026!";
const testDateId = "2027-03-16"; // mardi, sans lien avec une vraie tournée
const testOwnerLastName = "E2ETourRunTest";

async function cleanupTestData() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`DELETE FROM "TourRun" WHERE date = ${testDateId}::date AND name LIKE ${"%" + testOwnerLastName + "%"}`;
  await sql`DELETE FROM "Appointment" WHERE "clientName" LIKE ${"%" + testOwnerLastName}`;
}

async function clearLoginRateLimit() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`DELETE FROM "RateLimitEvent" WHERE key LIKE 'login:%'`;
}

// Zod (.cuid(), voir tour-runs-actions.ts) exige un id au format CUID — un
// UUID généré par gen_random_uuid() serait rejeté par la validation, alors
// que Prisma génère toujours de vrais CUID en production. On imite ce
// format ici plutôt que d'affaiblir la validation pour ce seul test.
function fakeCuid(): string {
  return `c${randomBytes(12).toString("hex")}`;
}

async function seedAppointment(): Promise<string> {
  const sql = neon(process.env.DATABASE_URL!);
  const id = fakeCuid();
  await sql`
    INSERT INTO "Appointment" (id, "clientName", "animalName", "animalSpecies", "serviceName", date, start, duration, mode, location, "postalCode", city, latitude, longitude, price, status, notes, "createdAt", "updatedAt")
    VALUES (${id}, ${"Client " + testOwnerLastName}, 'RexE2ETourRun', 'Chien', 'Ostéopathie canine', ${testDateId}::date, '10:00', 30, 'DOMICILE', '12 rue de Test', '76000', 'Rouen', 49.4432, 1.0999, 60, 'CONFIRMED', '', now(), now())
  `;
  return id;
}

const nearbyClientLastName = "E2ENearbyClientTest";
const nearbyAnimalName = "RexNearbyClient";

async function seedNearbyClient(): Promise<{ clientId: string; animalId: string }> {
  const sql = neon(process.env.DATABASE_URL!);
  const clientId = fakeCuid();
  const animalId = fakeCuid();
  // Position posée directement sur la fiche client (Client.latitude/
  // longitude, phase 3 bis) — depuis le retrait du repli par ville dans
  // getMapClients(), un client sans rendez-vous à domicile géolocalisé ni
  // position propre resterait "Position inconnue", jamais affiché ici.
  await sql`INSERT INTO "Client" (id, "firstName", "lastName", phone, email, city, address, latitude, longitude, "updatedAt") VALUES (${clientId}, 'Prénom', ${nearbyClientLastName}, '0600000000', 'nearby-client-e2e@example.fr', 'Rouen', '1 rue Test', 49.4432, 1.0999, now())`;
  await sql`INSERT INTO "Animal" (id, "clientId", name, species, breed, age, weight, sex, avatar, "avatarBackground", history, conditions, treatments, notes, "updatedAt") VALUES (${animalId}, ${clientId}, ${nearbyAnimalName}, 'Chien', '', '', '', '', '', '', '', '', '', '', now())`;
  return { clientId, animalId };
}

async function cleanupNearbyClient() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`DELETE FROM "Client" WHERE "lastName" = ${nearbyClientLastName}`;
}

async function login(page: Page) {
  await page.goto("/login");
  await page.fill('input[type="email"]', testEmail);
  await page.fill('input[type="password"]', testPassword);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard**", { timeout: 10000 });
}

test.describe("Éditeur de tournées interactif", () => {
  test.beforeEach(async () => {
    await clearLoginRateLimit();
    await cleanupTestData();
    await cleanupNearbyClient();
  });

  test.afterEach(async () => {
    await cleanupTestData();
    await cleanupNearbyClient();
  });

  test("créer une tournée, ajouter un rendez-vous et une adresse manuelle, persistance après rechargement", async ({ page }) => {
    await seedAppointment();
    await login(page);

    // Point d'entrée normal depuis la refonte "liste de journées datées"
    // (unification des tournées, phase 2) : "+ Nouvelle journée" sur
    // /dashboard/tournees ouvre une modale qui crée la TourRun puis navigue
    // vers ?date=... — équivalent ici à naviguer directement sur la date de
    // test. Depuis le correctif "un seul chemin de création", naviguer sur
    // une date sans TourRun ouvre automatiquement cette même modale
    // (NewTourDayModal) plutôt qu'un second formulaire dédié à l'éditeur.
    await page.goto(`/dashboard/tournees?date=${testDateId}`);

    const nameInput = page.locator("#new-tour-day-name");
    await expect(nameInput).toBeVisible({ timeout: 10000 });
    await nameInput.fill(`Tournée ${testOwnerLastName}`);
    await page.getByRole("button", { name: "Créer la journée" }).click();

    // L'éditeur se recharge (router.refresh) avec la tournée créée.
    await expect(page.getByText(`Tournée ${testOwnerLastName}`)).toBeVisible({ timeout: 10000 });

    // Ajout du rendez-vous du jour.
    await page.getByRole("button", { name: "+ Ajouter un arrêt" }).click();
    await expect(page.getByText("RexE2ETourRun")).toBeVisible({ timeout: 10000 });
    await page.getByText("RexE2ETourRun").click();
    await page.getByRole("button", { name: /^Ajouter \(1\)$/ }).click();

    await expect(page.getByText("RexE2ETourRun")).toBeVisible({ timeout: 10000 });

    // Ajout d'une adresse manuelle.
    await page.getByRole("button", { name: "+ Ajouter un arrêt" }).click();
    await page.getByRole("button", { name: "Adresse manuelle" }).click();
    await page.locator("#manual-stop-label").fill("Pause déjeuner");
    await page.getByRole("button", { name: "Ajouter comme étape" }).click();

    await expect(page.getByText("Pause déjeuner")).toBeVisible({ timeout: 10000 });

    // KPI mis à jour : au moins 1 RDV compté dans l'en-tête.
    await expect(page.getByText(/1 RDV/)).toBeVisible();

    // Persistance : rechargement complet, les deux arrêts doivent réapparaître.
    await page.reload();
    await expect(page.getByText("RexE2ETourRun")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Pause déjeuner")).toBeVisible();
  });

  // Le clic sur "Ajouter à la tournée" depuis la fiche d'un client de la
  // carte ouvre désormais un formulaire (crée un vrai rendez-vous à
  // domicile, phase 3 bis suite) — couvert par
  // tests/tour-run-add-client-appointment.spec.ts. Ce test-ci reste centré
  // sur son objet d'origine : le calque clients du secteur (masqué par
  // défaut, activable, sélection ouvrant la bonne fiche).
  test("affiche les clients à proximité sur la carte", async ({ page }) => {
    await seedNearbyClient();
    await login(page);

    await page.goto(`/dashboard/tournees?date=${testDateId}`);
    await page.locator("#new-tour-day-name").fill(`Tournée ${testOwnerLastName}`);
    await page.getByRole("button", { name: "Créer la journée" }).click();
    await expect(page.getByText(`Tournée ${testOwnerLastName}`)).toBeVisible({ timeout: 10000 });

    // Calque clients désactivé par défaut.
    await expect(page.getByRole("button", { name: new RegExp(nearbyAnimalName) })).toHaveCount(0);

    await page.getByRole("button", { name: /Afficher les clients du secteur/ }).click();
    const clientMarker = page.getByRole("button", { name: new RegExp(nearbyAnimalName) });
    await expect(clientMarker).toBeVisible({ timeout: 10000 });

    await clientMarker.click();
    await expect(page.getByText(`${nearbyAnimalName} — Prénom ${nearbyClientLastName}`, { exact: true })).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole("button", { name: "Ajouter à la tournée", exact: true })).toBeVisible();
  });
});
