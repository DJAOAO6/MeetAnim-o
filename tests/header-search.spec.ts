import { expect, test } from "@playwright/test";
import { config } from "dotenv";
import { neon } from "./helpers/sql";

config({ path: ".env.local" });
const sql = neon(process.env.DATABASE_URL!);

/**
 * Recherche de l'en-tête (chantier C5, phase 2) : des suggestions pendant la
 * frappe, tolérantes aux accents et aux fautes, sur ordinateur et sur mobile.
 *
 * Une fiche dédiée est créée pour l'occasion, puis supprimée.
 */
const CLIENT_ID = "e2e-header-search-client";
const ANIMAL_ID = "e2e-header-search-animal";

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await sql`DELETE FROM "Animal" WHERE id = ${ANIMAL_ID}`;
  await sql`DELETE FROM "Client" WHERE id = ${CLIENT_ID}`;
  await sql`INSERT INTO "Client" (id, "firstName", "lastName", phone, email, city, address, "updatedAt") VALUES (${CLIENT_ID}, 'Hélène', 'Zéphyrin', '06 71 72 73 74', '', 'Yvetot', '', now())`;
  await sql`INSERT INTO "Animal" (id, "clientId", name, species, breed, age, weight, sex, avatar, "avatarBackground", history, conditions, treatments, notes, "updatedAt") VALUES (${ANIMAL_ID}, ${CLIENT_ID}, 'Grisouille', 'Chat', '', '', '', '', '', '', '', '', '', '', now())`;
});

test.afterAll(async () => {
  await sql`DELETE FROM "Animal" WHERE id = ${ANIMAL_ID}`;
  await sql`DELETE FROM "Client" WHERE id = ${CLIENT_ID}`;
});

test("« helene zeph » propose la fiche avant Entrée, et la choisir l'ouvre", async ({ page }) => {
  await page.goto("/dashboard");
  const search = page.getByRole("combobox", { name: "Rechercher un client, un animal" });
  await search.fill("helene zeph");
  const suggestions = page.getByRole("listbox", { name: "Suggestions" });
  await expect(suggestions.getByRole("group", { name: "Clients" }).getByRole("option", { name: /Hélène Zéphyrin/ })).toBeVisible();
  await expect(search).toHaveAttribute("aria-expanded", "true");

  await suggestions.getByRole("option", { name: /Hélène Zéphyrin/ }).click();
  await page.waitForURL(`**/dashboard/clients/${CLIENT_ID}`);
  await expect(page.getByRole("heading", { name: /Hélène Zéphyrin/ }).first()).toBeVisible();
});

test("au clavier : Ctrl+K, flèches et Entrée ; un animal mal orthographié est proposé à part", async ({ page }) => {
  await page.goto("/dashboard/agenda");
  const search = page.getByRole("combobox", { name: "Rechercher un client, un animal" });
  await page.keyboard.press("Control+k");
  await expect(search).toBeFocused();

  await page.keyboard.type("grisoulle");
  const approximate = page.getByRole("group", { name: "Vous cherchiez peut-être" });
  await expect(approximate.getByRole("option", { name: /Grisouille/ })).toContainText("chat · Hélène Zéphyrin");
  await expect(page.getByRole("group", { name: "Animaux" }), "pas une correspondance franche").toHaveCount(0);

  await page.keyboard.press("ArrowDown");
  await expect(search).toHaveAttribute("aria-activedescendant", /option-0$/);
  await page.keyboard.press("Enter");
  // L'animal ouvre la fiche de son propriétaire, sur cet animal.
  await page.waitForURL(`**/dashboard/clients/${CLIENT_ID}?animal=${ANIMAL_ID}`);
});

test("Entrée sans choix : la liste des clients filtrée, elle aussi tolérante", async ({ page }) => {
  await page.goto("/dashboard");
  const search = page.getByRole("combobox", { name: "Rechercher un client, un animal" });
  await search.fill("zephirin");
  await search.press("Enter");
  await page.waitForURL("**/dashboard/clients?q=zephirin");
  await expect(page.getByText("Hélène Zéphyrin").first()).toBeVisible();

  // Nouvelle recherche depuis l'en-tête, la liste déjà affichée : elle suit.
  await search.fill("zzzz introuvable");
  await search.press("Enter");
  await page.waitForURL("**/dashboard/clients?q=zzzz%20introuvable");
  await expect(page.getByText("Hélène Zéphyrin")).toHaveCount(0);
});

test("sur mobile (390 px), la loupe ouvre la même recherche en plein écran", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Rechercher un client, un animal" }).click();
  const dialog = page.getByRole("dialog", { name: "Rechercher un client, un animal" });
  const search = dialog.getByRole("combobox", { name: "Rechercher un client, un animal" });
  await expect(search).toBeFocused();
  await search.fill("helene");
  await dialog.getByRole("option", { name: /Hélène Zéphyrin/ }).click();
  await page.waitForURL(`**/dashboard/clients/${CLIENT_ID}`);
  await expect(dialog, "refermée après le choix").toHaveCount(0);

  // Échap referme et rend le focus à la loupe.
  await page.getByRole("button", { name: "Rechercher un client, un animal" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Rechercher un client, un animal" })).toBeFocused();
});
