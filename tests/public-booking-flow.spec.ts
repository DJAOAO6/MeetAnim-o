import { config } from "dotenv";
import { expect, test } from "@playwright/test";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.local" });

/**
 * FIX_PLAN.md item 30(b) : aucun test actuel ne couvrait le parcours complet
 * de réservation publique de bout en bout jusqu'à l'écran de succès. Mode
 * Cabinet choisi délibérément : contrairement au mode Domicile, son champ
 * d'adresse (details-step.tsx) est une simple saisie manuelle, pas
 * AddressAutocomplete (API externe Géoplateforme IGN) — le parcours reste
 * ainsi entièrement déterministe, sans dépendance réseau externe fragile
 * dans une suite E2E.
 */

const professionalSlug = "pauline-faucillon";
const testOwnerLastName = "E2EBookingTest";

async function cleanupTestBooking() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`DELETE FROM "Appointment" WHERE "clientName" LIKE ${"%" + testOwnerLastName}`;
}

test.describe("Parcours complet de réservation publique", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async () => {
    await cleanupTestBooking();
  });

  test.afterEach(async () => {
    await cleanupTestBooking();
  });

  test("de la sélection de la prestation jusqu'à l'écran de succès, avec persistance réelle en base", async ({ page }) => {
    await page.goto(`/reserver/${professionalSlug}`);

    // Étape 1 · Consultation — service, mode, "Continuer"
    await page.getByText("Ostéopathie canine").first().click();
    await page.getByText("Au cabinet", { exact: true }).click();
    await page.getByRole("button", { name: "Continuer" }).click();

    // Étape 2 · Rendez-vous — première date sélectionnable du mois (les
    // cases du calendrier restent focusables au clavier même indisponibles :
    // aria-disabled, pas l'attribut HTML disabled — voir calendar-month.tsx),
    // premier créneau du matin.
    await page.waitForTimeout(600);
    const firstAvailableDate = page.locator('[role="gridcell"][aria-disabled="false"]').first();
    await firstAvailableDate.click();
    await page.waitForTimeout(500);
    const firstSlot = page.locator("button", { hasText: /^\d{2}:\d{2}$/ }).first();
    const chosenTime = await firstSlot.textContent();
    await firstSlot.click();
    await page.getByRole("button", { name: "Continuer" }).click();

    // Étape 3 · Vous & votre animal — coordonnées, adresse (saisie manuelle en
    // mode Cabinet), animal + motif obligatoire
    await page.waitForTimeout(600);
    await page.locator("#booking-details-firstName").fill("Test");
    await page.locator("#booking-details-lastName").fill(testOwnerLastName);
    await page.locator('input[autocomplete="tel"]').fill("0612345678");
    await page.locator('input[type="email"]').fill("e2e-booking-test@example.fr");

    await page.getByText("Adresse", { exact: true }).click();
    await page.waitForTimeout(300);
    await page.locator("#booking-details-address").fill("1 rue de la Réservation");
    await page.locator("#booking-details-postalCode").fill("76000");
    await page.locator("#booking-details-city").fill("Rouen");

    await page.getByText("Votre animal", { exact: true }).click();
    await page.waitForTimeout(300);
    await page.locator("#booking-details-animalName").fill("RexE2EBooking");
    await page.locator("#booking-details-reason").fill("Bilan de routine pour le test end-to-end.");
    await page.getByRole("button", { name: "Continuer" }).click();

    // Étape 4 · Confirmation — accepter la politique de confidentialité, réserver
    await page.waitForTimeout(600);
    await page.locator('input[type="checkbox"]').check();
    await page.getByRole("button", { name: "Réserver mon rendez-vous" }).click();

    // Écran de succès
    await expect(page.getByRole("heading", { name: /Demande envoyée à/ })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("En attente de validation")).toBeVisible();
    await expect(page.getByText("RexE2EBooking")).toBeVisible();

    // Boutons "Ajouter à mon agenda" (étapes 13-16 du chantier calendrier) :
    // Google et Outlook sont des liens pré-remplis (pas d'OAuth demandé au
    // client), Apple Calendar reste le téléchargement .ics existant.
    const googleLink = page.getByRole("link", { name: "Google Agenda" });
    await expect(googleLink).toHaveAttribute("href", /^https:\/\/calendar\.google\.com\/calendar\/render\?/);
    const appleLink = page.getByRole("link", { name: "Apple Calendar" });
    await expect(appleLink).toHaveAttribute("href", /^data:text\/calendar/);
    await expect(appleLink).toHaveAttribute("download", /\.ics$/);
    const outlookLink = page.getByRole("link", { name: "Outlook" });
    await expect(outlookLink).toHaveAttribute("href", /^https:\/\/outlook\.live\.com\/calendar\/0\/deeplink\/compose\?/);

    // Persistance réelle en base, statut PENDING (jamais confirmé
    // automatiquement — une demande publique reste en attente de validation
    // par le praticien), horaire exact choisi à l'étape 2.
    const sql = neon(process.env.DATABASE_URL!);
    const [appointment] = await sql`SELECT "animalName", "clientName", status, start, mode FROM "Appointment" WHERE "clientName" LIKE ${"%" + testOwnerLastName}`;
    expect(appointment).toBeTruthy();
    expect(appointment.animalName).toBe("RexE2EBooking");
    expect(appointment.status).toBe("PENDING");
    expect(appointment.mode).toBe("CABINET");
    expect(appointment.start).toBe(chosenTime?.trim());
  });

  test("un créneau qui vient d'être réservé disparaît de la liste pour la personne suivante", async ({ page }) => {
    // Réutilise le même chemin que le scénario précédent (première date/
    // premier créneau disponibles) plutôt que de viser une date précise par
    // navigation de calendrier — plus robuste, et suffisant pour vérifier
    // que le créneau tout juste réservé disparaît réellement de la liste
    // proposée à la personne suivante (getOccupiedSlotsAction), sans
    // dépendre d'une date figée qui pourrait sortir de la fenêtre de
    // réservation publique (J+1 à J+90) selon le jour où ce test tourne.
    async function pickFirstAvailableSlot() {
      await page.goto(`/reserver/${professionalSlug}`);
      await page.getByText("Ostéopathie canine").first().click();
      await page.getByText("Au cabinet", { exact: true }).click();
      await page.getByRole("button", { name: "Continuer" }).click();
      await page.waitForTimeout(600);
      await page.locator('[role="gridcell"][aria-disabled="false"]').first().click();
      await page.waitForTimeout(500);
    }

    await pickFirstAvailableSlot();
    const firstSlotBefore = await page.locator("button", { hasText: /^\d{2}:\d{2}$/ }).first().textContent();
    await page.locator("button", { hasText: /^\d{2}:\d{2}$/ }).first().click();
    await page.getByRole("button", { name: "Continuer" }).click();
    await page.waitForTimeout(600);

    await page.locator("#booking-details-firstName").fill("Test");
    await page.locator("#booking-details-lastName").fill(testOwnerLastName);
    await page.locator('input[autocomplete="tel"]').fill("0612345678");
    await page.locator('input[type="email"]').fill("e2e-booking-taken@example.fr");
    await page.getByText("Adresse", { exact: true }).click();
    await page.waitForTimeout(300);
    await page.locator("#booking-details-address").fill("1 rue de la Réservation");
    await page.locator("#booking-details-postalCode").fill("76000");
    await page.locator("#booking-details-city").fill("Rouen");
    await page.getByText("Votre animal", { exact: true }).click();
    await page.waitForTimeout(300);
    await page.locator("#booking-details-animalName").fill("PremierOccupant");
    await page.locator("#booking-details-reason").fill("Bilan de routine pour le test end-to-end.");
    await page.getByRole("button", { name: "Continuer" }).click();
    await page.waitForTimeout(600);
    await page.locator('input[type="checkbox"]').check();
    await page.getByRole("button", { name: "Réserver mon rendez-vous" }).click();
    await expect(page.getByRole("heading", { name: /Demande envoyée à/ })).toBeVisible({ timeout: 15000 });

    // Nouvelle session de réservation, même date, même créneau visé : le
    // créneau qui vient d'être pris ne doit plus être proposé.
    await pickFirstAvailableSlot();
    const slotButtons = page.locator("button", { hasText: /^\d{2}:\d{2}$/ });
    const stillOffered = await slotButtons.filter({ hasText: firstSlotBefore ?? "" }).count();
    expect(stillOffered).toBe(0);
  });
});
