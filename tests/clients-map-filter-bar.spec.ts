import { config } from "dotenv";
import { expect, test, type Page } from "@playwright/test";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.local" });

/**
 * Recherche unifiée et filtres de la carte clients — Phase 2 : barre de
 * filtres compacte (une ligne : recherche, bouton Espèce, compteur),
 * panneau Espèce multi-sélection, "À relancer" indépendant, jetons de
 * filtres actifs uniquement. Voir le prompt dédié.
 *
 * La base de dev contient de vrais clients de démonstration dont les noms,
 * espèces et statuts se recoupent largement avec le texte cherché ici
 * ("Chien", "À relancer"…) : les locators ci-dessous s'appuient sur les
 * attributs ARIA propres aux contrôles (aria-haspopup, aria-pressed) plutôt
 * que sur leur libellé texte, pour rester non ambigus face à ce bruit.
 */

const testEmail = "praticien-test@pf-osteo-animale.fr";
const testPassword = "Praticien-Test-2026!";
const testClientDogId = "tmp-filterbar-client-dog";
const testClientCatId = "tmp-filterbar-client-cat";
const testAnimalDogId = "tmp-filterbar-animal-dog";
const testAnimalCatId = "tmp-filterbar-animal-cat";
const testReminderId = "tmp-filterbar-reminder";
const dogClientLastName = "FilterBarDogE2E";
const catClientLastName = "FilterBarCatE2E";
const dogAnimalName = "FidoFilterBarE2E";
const catAnimalName = "MinouFilterBarE2E";

async function seed() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`INSERT INTO "Client" (id, "firstName", "lastName", phone, email, city, address, "updatedAt") VALUES (${testClientDogId}, 'Alex', ${dogClientLastName}, '0600000003', 'filterbar-dog@example.fr', 'Rouen', '1 rue Test', now())`;
  await sql`INSERT INTO "Client" (id, "firstName", "lastName", phone, email, city, address, "updatedAt") VALUES (${testClientCatId}, 'Sam', ${catClientLastName}, '0600000004', 'filterbar-cat@example.fr', 'Rouen', '2 rue Test', now())`;
  await sql`INSERT INTO "Animal" (id, "clientId", name, species, breed, age, weight, sex, avatar, "avatarBackground", history, conditions, treatments, notes, "updatedAt") VALUES (${testAnimalDogId}, ${testClientDogId}, ${dogAnimalName}, 'Chien', '', '', '', '', '', '', '', '', '', '', now())`;
  await sql`INSERT INTO "Animal" (id, "clientId", name, species, breed, age, weight, sex, avatar, "avatarBackground", history, conditions, treatments, notes, "updatedAt") VALUES (${testAnimalCatId}, ${testClientCatId}, ${catAnimalName}, 'Chat', '', '', '', '', '', '', '', '', '', '', now())`;
  // Rappel dû pour l'animal Chien seulement : distingue le filtre "À
  // relancer" du filtre espèce dans les tests ci-dessous.
  await sql`
    INSERT INTO "Reminder" (id, "clientId", "animalId", "lastConsultation", delay, "dueDate", status, "createdAt", "updatedAt")
    VALUES (${testReminderId}, ${testClientDogId}, ${testAnimalDogId}, now() - interval '4 months', 'THREE_MONTHS', now() - interval '1 day', 'DUE', now(), now())
  `;
}

async function cleanup() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`DELETE FROM "Reminder" WHERE id = ${testReminderId}`;
  await sql`DELETE FROM "Animal" WHERE id IN (${testAnimalDogId}, ${testAnimalCatId})`;
  await sql`DELETE FROM "Client" WHERE id IN (${testClientDogId}, ${testClientCatId})`;
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

async function openMap(page: Page) {
  await page.goto("/dashboard/tournees");
  await page.waitForTimeout(600);
  await page.getByRole("button", { name: "Carte clients" }).click();
}

/** Bouton Espèce : seul élément de la barre portant aria-haspopup. */
function speciesButtonLocator(page: Page) {
  return page.locator('button[aria-haspopup="true"]');
}

/** Bouton « À relancer » : seul bouton de bascule portant aria-pressed dans la barre de filtres (hors jetons, qui n'en portent pas). */
function dueButtonLocator(page: Page) {
  return page.locator('button[aria-pressed]').filter({ hasText: "À relancer" });
}

test.describe("Carte clients — barre de filtres compacte (Phase 2)", () => {
  test.beforeEach(async ({ page }) => {
    await cleanup();
    await seed();
    await clearLoginRateLimit();
    await login(page);
  });

  test.afterEach(async () => {
    await cleanup();
  });

  test("le bouton Espèce ouvre un panneau multi-sélection dont le libellé reflète l'état", async ({ page }) => {
    await openMap(page);

    const speciesButton = speciesButtonLocator(page);
    await expect(speciesButton).toBeVisible();
    await expect(speciesButton).toHaveText("Espèce");
    await speciesButton.click();

    const panel = page.getByRole("group", { name: "Filtrer par espèce" });
    await expect(panel).toBeVisible();
    await panel.getByText("Chien", { exact: true }).click();
    await expect(speciesButton).toHaveText("Chien");

    await panel.getByText("Chat", { exact: true }).click();
    await expect(speciesButton).toHaveText("2 espèces");
  });

  test("« À relancer » reste hors du panneau Espèce, filtre indépendant", async ({ page }) => {
    await openMap(page);

    await speciesButtonLocator(page).click();
    const panel = page.getByRole("group", { name: "Filtrer par espèce" });
    await expect(panel).toBeVisible();
    await expect(panel.getByText("À relancer")).toHaveCount(0);

    const dueButton = dueButtonLocator(page);
    await expect(dueButton).toBeVisible();
    await expect(dueButton).toHaveAttribute("aria-pressed", "false");
    await dueButton.click();
    await expect(dueButton).toHaveAttribute("aria-pressed", "true");

    // Seul le chien (rappel dû) reste visible dans la liste "Clients visibles".
    const clientsList = page.getByRole("heading", { name: "Clients visibles" }).locator("xpath=../following-sibling::div[1]");
    await expect(clientsList.getByText(dogAnimalName)).toBeVisible();
    await expect(clientsList.getByText(catAnimalName)).toHaveCount(0);
  });

  test("les jetons de filtres actifs n'apparaissent que si un filtre est actif, et « Tout effacer » les retire tous", async ({ page }) => {
    await openMap(page);

    const clearAllButton = page.getByRole("button", { name: "Tout effacer" });
    await expect(clearAllButton).toHaveCount(0);

    await speciesButtonLocator(page).click();
    await page.getByRole("group", { name: "Filtrer par espèce" }).getByText("Chien", { exact: true }).click();
    await dueButtonLocator(page).click();

    // Chaque jeton porte son libellé suivi d'une croix ("Chien ×") : pas de
    // correspondance exacte possible sur le seul libellé, mais chacun est un
    // bouton distinct dans la ligne de jetons.
    const tokensRow = clearAllButton.locator("xpath=..");
    await expect(tokensRow.getByRole("button").filter({ hasText: "Chien" })).toBeVisible();
    await expect(tokensRow.getByRole("button").filter({ hasText: "À relancer" })).toBeVisible();

    await clearAllButton.click();
    await expect(page.getByRole("button", { name: "Tout effacer" })).toHaveCount(0);
    await expect(speciesButtonLocator(page)).toHaveText("Espèce");
    await expect(dueButtonLocator(page)).toHaveAttribute("aria-pressed", "false");

    const clientsList = page.getByRole("heading", { name: "Clients visibles" }).locator("xpath=../following-sibling::div[1]");
    await expect(clientsList.getByText(catAnimalName)).toBeVisible();
  });

  test("à 380px : le champ occupe toute la largeur, les contrôles passent sur une seconde ligne, cibles tactiles ≥ 44px", async ({ page }) => {
    await page.setViewportSize({ width: 380, height: 900 });
    await openMap(page);

    const search = page.getByPlaceholder("Rechercher un client, un animal ou un lieu");
    const speciesButton = speciesButtonLocator(page);
    const dueButton = dueButtonLocator(page);

    await expect(search).toBeVisible();
    await expect(speciesButton).toBeVisible();
    await expect(dueButton).toBeVisible();

    const searchBox = await search.boundingBox();
    const speciesBox = await speciesButton.boundingBox();
    const dueBox = await dueButton.boundingBox();
    expect(searchBox).not.toBeNull();
    expect(speciesBox).not.toBeNull();
    expect(dueBox).not.toBeNull();

    // Le champ occupe toute la largeur disponible, les boutons passent sur
    // une ligne distincte (en dessous du champ).
    expect(searchBox!.y).toBeLessThan(speciesBox!.y);
    expect(searchBox!.width).toBeGreaterThan(300);

    expect(speciesBox!.height).toBeGreaterThanOrEqual(44);
    expect(dueBox!.height).toBeGreaterThanOrEqual(44);
  });
});
