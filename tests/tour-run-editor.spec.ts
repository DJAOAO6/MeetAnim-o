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
  });

  test.afterEach(async () => {
    await cleanupTestData();
  });

  test("créer une tournée, ajouter un rendez-vous et une adresse manuelle, persistance après rechargement", async ({ page }) => {
    await seedAppointment();
    await login(page);

    // Point d'entrée normal : depuis la vue d'ensemble, "+ Nouvelle tournée"
    // ouvre l'éditeur et pousse ?date=... dans l'URL.
    await page.goto("/dashboard/tournees");
    await page.getByRole("button", { name: "+ Nouvelle tournée" }).click();
    await page.waitForURL(/\?date=\d{4}-\d{2}-\d{2}/, { timeout: 10000 });

    // On repart ensuite directement sur la date de test (comportement
    // équivalent à naviguer via les flèches ‹ › de l'en-tête).
    await page.goto(`/dashboard/tournees?date=${testDateId}`);

    // Naviguer avec ?date= rouvre l'éditeur directement (voir explicitDate,
    // tours-view.tsx) — comme aucune tournée n'existe encore pour ce jour,
    // le formulaire de création s'affiche tout de suite.
    // Formulaire de création — départ/arrivée par défaut (Cabinet), on valide directement.
    const nameInput = page.locator("#tour-run-name");
    await expect(nameInput).toBeVisible({ timeout: 10000 });
    await nameInput.fill(`Tournée ${testOwnerLastName}`);
    await page.getByRole("button", { name: "Créer la tournée" }).click();

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
});
