import { config } from "dotenv";
import { expect, test, type Page, type Route } from "@playwright/test";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.local" });

/**
 * Recherche unifiée et filtres de la carte clients — Phase 1 : un seul champ
 * remplace les deux recherches et le select Ville, avec une liste de
 * résultats groupée par type (Lieux/Clients/Animaux). Voir le prompt dédié.
 */

const testEmail = "praticien-test@pf-osteo-animale.fr";
const testPassword = "Praticien-Test-2026!";
const testClientAId = "tmp-usearch-client-a";
const testClientBId = "tmp-usearch-client-b";
const testAnimalAId = "tmp-usearch-animal-a";
const testAnimalBId = "tmp-usearch-animal-b";
const sharedLastName = "UnifiedSearchE2E";
const animalAName = "MinouUnifiedE2E";
const animalBName = "RexUnifiedE2E";

// Réponse Géoplateforme (communes) minimale mais réaliste, pour une
// sélection de lieu déterministe sans dépendre du réseau réel.
const MOCK_COMMUNES = [
  { nom: "Rouen", code: "76540", centre: { type: "Point", coordinates: [1.0999, 49.4432] }, departement: { code: "76", nom: "Seine-Maritime" } },
];

async function seed() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`INSERT INTO "Client" (id, "firstName", "lastName", phone, email, city, address, "updatedAt") VALUES (${testClientAId}, 'Camille', ${sharedLastName}, '0600000001', 'usearch-a@example.fr', 'Rouen', '1 rue Test', now())`;
  await sql`INSERT INTO "Client" (id, "firstName", "lastName", phone, email, city, address, "updatedAt") VALUES (${testClientBId}, 'Julien', ${sharedLastName}, '0600000002', 'usearch-b@example.fr', 'Rouen', '2 rue Test', now())`;
  await sql`INSERT INTO "Animal" (id, "clientId", name, species, breed, age, weight, sex, avatar, "avatarBackground", history, conditions, treatments, notes, "updatedAt") VALUES (${testAnimalAId}, ${testClientAId}, ${animalAName}, 'Chat', '', '', '', '', '', '', '', '', '', '', now())`;
  await sql`INSERT INTO "Animal" (id, "clientId", name, species, breed, age, weight, sex, avatar, "avatarBackground", history, conditions, treatments, notes, "updatedAt") VALUES (${testAnimalBId}, ${testClientBId}, ${animalBName}, 'Chien', '', '', '', '', '', '', '', '', '', '', now())`;
}

async function cleanup() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`DELETE FROM "Animal" WHERE id IN (${testAnimalAId}, ${testAnimalBId})`;
  await sql`DELETE FROM "Client" WHERE id IN (${testClientAId}, ${testClientBId})`;
}

async function clearLoginRateLimit() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`DELETE FROM "RateLimitEvent" WHERE key LIKE 'login:%'`;
}

/**
 * Simule le réseau Géoplateforme : ne renvoie "Rouen" que si la requête le
 * mentionne réellement (sinon la recherche d'un animal comme "MinouUnifiedE2E"
 * ferait apparaître un faux résultat "Rouen" dans le groupe Lieux). Permet
 * aussi de retarder la réponse pour vérifier que le groupe Clients ne
 * l'attend jamais.
 */
async function mockPlaceSearch(page: Page, delayMs: number) {
  await page.route("https://geo.api.gouv.fr/communes**", async (route: Route) => {
    const url = new URL(route.request().url());
    const matches = (url.searchParams.get("nom") ?? "").toLocaleLowerCase("fr-FR").includes("rouen");
    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(matches ? MOCK_COMMUNES : []) });
  });
  await page.route("https://geo.api.gouv.fr/departements**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await page.route("https://geo.api.gouv.fr/regions**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
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

test.describe("Carte clients — recherche unifiée (Phase 1)", () => {
  test.beforeEach(async ({ page }) => {
    await cleanup();
    await seed();
    await clearLoginRateLimit();
    await login(page);
  });

  test.afterEach(async () => {
    await cleanup();
  });

  test("affiche le groupe Clients dès que la recherche locale répond, avant que le groupe Lieux ait fini de charger", async ({ page }) => {
    await mockPlaceSearch(page, 2000);
    await openMap(page);

    const search = page.getByPlaceholder("Rechercher un client, un animal ou un lieu");
    await search.fill(sharedLastName);
    const listbox = page.getByRole("listbox", { name: "Résultats de recherche" });

    // Les deux clients (recherche locale, rapide) apparaissent avant même
    // que la recherche de lieu (réseau, ralentie à 2s) ne soit résolue.
    await expect(listbox.getByRole("option", { name: new RegExp(`Camille ${sharedLastName}`) })).toBeVisible({ timeout: 1000 });
    await expect(listbox.getByRole("option", { name: new RegExp(`Julien ${sharedLastName}`) })).toBeVisible();
  });

  test("sélectionner un lieu applique un périmètre", async ({ page }) => {
    await mockPlaceSearch(page, 0);
    await openMap(page);

    const search = page.getByPlaceholder("Rechercher un client, un animal ou un lieu");
    await search.fill("Rouen");
    // Scopé au groupe "Lieux" : des fiches clients réelles de la base de dev
    // habitent aussi Rouen et remonteraient sinon dans la même recherche.
    const placesGroup = page.getByRole("group", { name: "Lieux · définir un périmètre" });
    const placeOption = placesGroup.getByRole("option", { name: /Rouen/ });
    await expect(placeOption).toBeVisible();
    await placeOption.click();

    // Scopé au paragraphe de la bannière : depuis la phase 2, un jeton de
    // filtre actif ("15 km autour de Rouen ×") reprend un texte proche.
    const banner = page.getByText(/dans un rayon de/);
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("Rouen");
  });

  test("valider du texte libre sans sélection filtre uniquement les clients", async ({ page }) => {
    await mockPlaceSearch(page, 0);
    await openMap(page);

    const search = page.getByPlaceholder("Rechercher un client, un animal ou un lieu");
    await search.fill("Camille");
    const listbox = page.getByRole("listbox", { name: "Résultats de recherche" });
    await expect(listbox.getByRole("option", { name: new RegExp(`Camille ${sharedLastName}`) })).toBeVisible();
    await search.press("Enter");

    // La liste "Clients visibles" ne montre plus que Camille — Julien, qui
    // ne correspond pas au texte, disparaît de la carte comme de la liste.
    // Scopée au conteneur de la liste : un marqueur Leaflet porte aussi un
    // role="button" avec le même nom dans son title, et la fiche
    // récapitulative peut aussi afficher ce nom.
    const clientsList = page.getByRole("heading", { name: "Clients visibles" }).locator("xpath=../following-sibling::div[1]");
    await expect(clientsList.getByRole("button", { name: new RegExp(`Camille ${sharedLastName}`) })).toBeVisible();
    await expect(clientsList.getByText(`Julien ${sharedLastName}`)).toHaveCount(0);
  });

  test("parcours complet au clavier : recherche, flèches, Entrée sélectionne un client", async ({ page }) => {
    await mockPlaceSearch(page, 0);
    await openMap(page);

    const search = page.getByPlaceholder("Rechercher un client, un animal ou un lieu");
    await search.fill(animalAName);
    const listbox = page.getByRole("listbox", { name: "Résultats de recherche" });
    const animalOption = listbox.getByRole("option", { name: new RegExp(animalAName) });
    await expect(animalOption).toBeVisible();

    // Un seul groupe (Animaux) a un résultat pour cette recherche : la
    // première flèche bas active donc directement cette unique option.
    await search.press("ArrowDown");
    await expect(animalOption).toHaveAttribute("aria-selected", "true");
    await search.press("Enter");

    // La sélection centre la carte sur ce client et affiche sa fiche en overlay.
    await expect(page.getByRole("heading", { name: "Camille " + sharedLastName })).toBeVisible();
  });
});
