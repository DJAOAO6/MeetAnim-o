import { config } from "dotenv";
import { expect, test, type Page } from "./helpers/test";
import { neon } from "./helpers/sql";

config({ path: ".env.local" });

/**
 * Retours praticienne (C1, phase 3) : toute la ligne d'un client ouvre sa
 * fiche ; les noms des animaux passent avant leur nombre ; « Nouveau
 * rendez-vous » depuis la fiche part du client et de l'animal affichés ; les
 * animaux sont dans l'ordre alphabétique.
 */

const testEmail = "praticien-test@pf-osteo-animale.fr";
const testPassword = "Praticien-Test-2026!";
const CLIENT_ID = "tmp-row-client";

async function cleanup() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`DELETE FROM "Animal" WHERE "clientId" = ${CLIENT_ID}`;
  await sql`DELETE FROM "Client" WHERE id = ${CLIENT_ID}`;
}

async function login(page: Page) {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`DELETE FROM "RateLimitEvent" WHERE key LIKE 'login:%'`;
  await page.goto("/login");
  await page.fill('input[type="email"]', testEmail);
  await page.fill('input[type="password"]', testPassword);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard**", { timeout: 10000 });
}

test.describe("Liste et fiche client", () => {
  test.beforeAll(async () => {
    await cleanup();
    const sql = neon(process.env.DATABASE_URL!);
    await sql`INSERT INTO "Client" (id, "firstName", "lastName", phone, email, city, address, "updatedAt") VALUES (${CLIENT_ID}, 'Test', 'LigneE2E', '0600000099', 'ligne-e2e@example.fr', 'Villeligne', '1 rue Test', now())`;
    // Insérés dans le désordre, avec un accent et une minuscule.
    for (const [suffix, name] of [["z", "Zeus"], ["e", "éclair"], ["a", "Abricot"], ["m", "Milo"]] as const) {
      await sql`INSERT INTO "Animal" (id, "clientId", name, species, breed, age, weight, sex, avatar, "avatarBackground", history, conditions, treatments, notes, "updatedAt") VALUES (${`tmp-row-animal-${suffix}`}, ${CLIENT_ID}, ${name}, 'Chien', '', '', '', '', '', '', '', '', '', '', now())`;
    }
  });
  test.afterAll(cleanup);

  test("la ligne ouvre la fiche ; noms des animaux en avant ; ordre alphabétique ; RDV prérempli", async ({ page }) => {
    await login(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/dashboard/clients?q=LigneE2E", { waitUntil: "networkidle" });

    const row = page.locator("tr").filter({ hasText: "LigneE2E" });
    await expect(row).toContainText("Abricot, éclair, Milo, Zeus");
    await expect(row).toContainText("4 animaux");
    // Un clic sur la ville (pas sur le nom ni sur « Voir la fiche ») ouvre la
    // fiche. Clic aux coordonnées : le lien étendu à la ligne recouvre la
    // cellule, ce que Playwright refuse de « traverser » — c'est voulu.
    const city = (await row.getByText("Villeligne").boundingBox())!;
    await page.mouse.click(city.x + city.width / 2, city.y + city.height / 2);
    await page.waitForURL(`**/dashboard/clients/${CLIENT_ID}`);

    // Fiche : animaux dans l'ordre alphabétique, accents et majuscules ignorés.
    const animals = page.locator("button[aria-pressed]").filter({ has: page.locator("[role='img'][aria-label^='Pictogramme de']") });
    await expect(animals).toHaveText([/Abricot/, /éclair/, /Milo/, /Zeus/]);

    // Nouveau rendez-vous : le client et l'animal affichés sont déjà choisis.
    await animals.filter({ hasText: "Milo" }).click();
    await page.getByRole("button", { name: "Nouveau rendez-vous" }).first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("Test LigneE2E");
    // Plusieurs animaux : ce sont des cases à cocher depuis les visites à
    // plusieurs animaux, et celle de l'animal affiché est cochée.
    await expect(dialog.getByRole("checkbox", { name: /Milo/ })).toBeChecked();
  });

  test("en mode sélection, un clic sur la ligne coche la case au lieu d'ouvrir la fiche", async ({ page }) => {
    // La sélection est réservée aux comptes autorisés à supprimer : la
    // permission est accordée le temps du test, puis l'état d'origine revient.
    const sql = neon(process.env.DATABASE_URL!);
    const [user] = await sql`SELECT permissions FROM "User" WHERE email = ${testEmail}`;
    await sql`UPDATE "User" SET permissions = ARRAY['DELETE_CLIENTS'] WHERE email = ${testEmail}`;
    try {
      await login(page);
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto("/dashboard/clients?q=LigneE2E", { waitUntil: "networkidle" });
      await page.getByRole("button", { name: "Sélectionner" }).click();
      const row = page.locator("tr").filter({ hasText: "LigneE2E" });
      await row.getByText("Villeligne").click();
      await expect(row.getByRole("checkbox")).toBeChecked();
      await expect(page).toHaveURL(/\/dashboard\/clients\?q=LigneE2E/);
    } finally {
      await sql`UPDATE "User" SET permissions = ${user.permissions} WHERE email = ${testEmail}`;
    }
  });
});
