import { config } from "dotenv";
import { expect, test, type Page } from "@playwright/test";
import { neon } from "./helpers/sql";

config({ path: ".env.local" });

/**
 * Phase 8.9 : un animal peut vivre ailleurs que chez son propriétaire. Le
 * lieu se crée depuis la fiche de l'animal (« Où vit-il ? »), il est
 * localisé à partir de son adresse (géocodeur IGN réel), et se gère depuis
 * « Lieux des animaux » ; le supprimer ramène l'animal chez son propriétaire.
 */

const testEmail = "praticien-test@pf-osteo-animale.fr";
const testPassword = "Praticien-Test-2026!";
const CLIENT_ID = "tmp-place-client";
const ANIMAL_ID = "tmp-place-animal";
const PLACE_NAME = "Haras E2E du Moulin";

async function cleanup() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`DELETE FROM "Animal" WHERE id = ${ANIMAL_ID}`;
  await sql`DELETE FROM "Client" WHERE id = ${CLIENT_ID}`;
  await sql`DELETE FROM "AnimalPlace" WHERE name = ${PLACE_NAME}`;
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

test.describe("Lieux des animaux", () => {
  test.beforeAll(async () => {
    await cleanup();
    const sql = neon(process.env.DATABASE_URL!);
    await sql`INSERT INTO "Client" (id, "firstName", "lastName", phone, email, city, address, "updatedAt") VALUES (${CLIENT_ID}, 'Test', 'LieuE2E', '0600000081', 'lieu-e2e@example.fr', 'Rouen', '1 rue Test', now())`;
    await sql`INSERT INTO "Animal" (id, "clientId", name, species, breed, age, weight, sex, avatar, "avatarBackground", history, conditions, treatments, notes, "updatedAt") VALUES (${ANIMAL_ID}, ${CLIENT_ID}, 'TornadeE2E', 'Cheval', 'Selle français', '', '', '', '', '', '', '', '', '', now())`;
  });
  test.afterAll(cleanup);

  test("créer le lieu depuis la fiche de l'animal, le gérer, le supprimer", async ({ page }) => {
    test.setTimeout(90000);
    await login(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/dashboard/clients/${CLIENT_ID}`, { waitUntil: "networkidle" });

    await page.getByRole("button", { name: "Modifier la fiche de TornadeE2E" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Dans un nouveau lieu").check();
    await dialog.getByLabel("Nom du lieu").fill(PLACE_NAME);
    await dialog.getByLabel("Adresse").fill("16 rue de Paris");
    await dialog.getByLabel("Code postal").fill("76600");
    await dialog.getByLabel("Commune").fill("Le Havre");
    await dialog.getByRole("button", { name: "Enregistrer les modifications" }).click();
    await expect(dialog).toHaveCount(0, { timeout: 20000 });
    await expect(page.getByText(`Vit au ${PLACE_NAME}, Le Havre`).first()).toBeVisible();

    const sql = neon(process.env.DATABASE_URL!);
    const [place] = await sql`SELECT p.id, p.kind, p.latitude, p."geocodePrecision" FROM "AnimalPlace" p JOIN "Animal" a ON a."placeId" = p.id WHERE a.id = ${ANIMAL_ID}`;
    expect(place.kind).toBe("HARAS");
    expect(place.latitude, "localisé à partir de son adresse").not.toBeNull();

    // L'écran des lieux : propriétaires, animaux, notes d'accès.
    await page.goto("/dashboard/clients", { waitUntil: "networkidle" });
    await page.getByRole("link", { name: "Lieux des animaux" }).click();
    const card = page.getByTestId("place-card").filter({ hasText: PLACE_NAME });
    await expect(card).toContainText("1 propriétaire · 1 animal");
    await expect(card.getByRole("link", { name: /TornadeE2E/ })).toHaveAttribute("href", `/dashboard/clients/${CLIENT_ID}`);
    await card.getByRole("button", { name: `Modifier ${PLACE_NAME}` }).click();
    await page.getByRole("dialog").getByLabel("Notes d’accès").fill("Portail vert, code 1234");
    await page.getByRole("dialog").getByRole("button", { name: "Enregistrer" }).click();
    await expect(card).toContainText("Portail vert, code 1234");

    await card.getByRole("button", { name: `Supprimer ${PLACE_NAME}` }).click();
    await expect(page.getByRole("dialog")).toContainText(/Son animal redeviendra «\s?chez son propriétaire\s?»/);
    await page.getByRole("dialog").getByRole("button", { name: "Supprimer" }).click();
    await expect(card).toHaveCount(0);
    const [animal] = await sql`SELECT "placeId" FROM "Animal" WHERE id = ${ANIMAL_ID}`;
    expect(animal.placeId).toBeNull();
  });
});
