import { config } from "dotenv";
import { expect, test } from "@playwright/test";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.local" });

/**
 * Studio de documents, étape 31 : schéma anatomique interactif.
 *
 * Les zones étant du DOM/SVG (et non plus un canvas Konva), ces tests
 * cliquent la structure anatomique par son identifiant réel plutôt qu'à des
 * coordonnées en pixels — ils ne cassent donc plus si le dessin bouge.
 */

const testEmail = "praticien-test@pf-osteo-animale.fr";
const testPassword = "Praticien-Test-2026!";
const testTitle = "E2EAnatomyTest";

type AnatomyElement = {
  type: string;
  viewId?: string;
  showLabels?: boolean;
  observations?: { id: string; zoneId: string; presetId: string; note?: string }[];
};

async function cleanupDocuments() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`DELETE FROM "StudioDocument" WHERE title LIKE ${testTitle + "%"}`;
}

async function clearLoginRateLimit() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`DELETE FROM "RateLimitEvent" WHERE key LIKE 'login:%'`;
}

/**
 * Les libellés des préréglages sont renommables par le cabinet et partagés
 * par toute l'équipe : les écrire en dur ici rendrait ces tests dépendants
 * d'un renommage fait ailleurs (constaté — « Tension » vaut « T7 » en base).
 * On lit donc le libellé courant plutôt que de le supposer.
 */
async function presetLabel(presetId: string): Promise<string> {
  const sql = neon(process.env.DATABASE_URL!);
  const [profile] = await sql`SELECT "markerPresets" FROM "BusinessProfile" LIMIT 1`;
  const presets = (profile?.markerPresets ?? []) as { id: string; label: string }[];
  return presets.find((preset) => preset.id === presetId)?.label ?? presetId;
}

async function readAnatomyElement(title: string): Promise<AnatomyElement | undefined> {
  const sql = neon(process.env.DATABASE_URL!);
  const [row] = await sql`SELECT "contentJson" FROM "StudioDocument" WHERE title = ${title}`;
  const content = row.contentJson as { pages: { elements: AnatomyElement[] }[] };
  return content.pages[0].elements.find((element) => element.type === "anatomy");
}

async function createDocumentWithDiagram(page: import("@playwright/test").Page, title: string) {
  await page.goto("/dashboard/documents");
  await page.getByRole("button", { name: "Nouveau document" }).click();
  await page.getByPlaceholder("Ex. Compte rendu — Oslo").fill(title);
  await page.getByRole("dialog").getByRole("button", { name: "Créer" }).click();
  await page.waitForURL(/\/dashboard\/documents\/[a-z0-9]+/, { timeout: 10000 });
  await page.waitForTimeout(600);

  await page.getByRole("button", { name: "Schémas" }).click();
  await page.getByRole("button", { name: "Vue latérale gauche" }).click();
  await page.waitForTimeout(400);
}

test.describe("Documents — schéma anatomique interactif (étape 31)", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async ({ page }) => {
    await cleanupDocuments();
    await clearLoginRateLimit();
    await page.goto("/login");
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', testPassword);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard**", { timeout: 10000 });
  });

  test.afterEach(async () => {
    await cleanupDocuments();
  });

  test("insérer un schéma persiste la vue et une liste d'observations vide", async ({ page }) => {
    const title = `${testTitle} Insertion`;
    await createDocumentWithDiagram(page, title);
    await page.waitForTimeout(2500);

    const element = await readAnatomyElement(title);
    expect(element).toBeTruthy();
    expect(element?.viewId).toBe("dog.lateral-left");
    expect(element?.observations).toEqual([]);
    expect(element?.showLabels).toBe(true);
  });

  test("armer un type puis cliquer une zone enregistre une observation ancrée", async ({ page }) => {
    const title = `${testTitle} Pose`;
    await createDocumentWithDiagram(page, title);

    const restriction = await presetLabel("restriction");
    await page.getByRole("button", { name: restriction, exact: true }).click();
    await expect(page.getByText("Choisissez une zone")).toBeVisible();

    await page.locator('[data-zone-id="dog.spine.c7_t1"]').first().click();
    await page.waitForTimeout(2500);

    const element = await readAnatomyElement(title);
    expect(element?.observations?.length).toBe(1);
    // L'observation porte l'identifiant anatomique, pas des coordonnées.
    expect(element?.observations?.[0].zoneId).toBe("dog.spine.c7_t1");
    expect(element?.observations?.[0].presetId).toBe("restriction");

    await expect(page.getByRole("button", { name: new RegExp(`Charnière C7-T1 — ${restriction}`) })).toBeVisible();
  });

  test("la recherche et le clic sur le schéma désignent la même zone", async ({ page }) => {
    const title = `${testTitle} Recherche`;
    await createDocumentWithDiagram(page, title);

    // « grasset » est le nom vétérinaire du genou : la recherche doit le
    // ramener, et produire exactement le même identifiant qu'un clic.
    await page.getByRole("button", { name: await presetLabel("tension"), exact: true }).click();
    await page.getByLabel("Rechercher une zone").fill("grasset");
    await page.getByRole("button", { name: /Genou gauche/ }).first().click();
    await page.waitForTimeout(2500);

    const element = await readAnatomyElement(title);
    expect(element?.observations?.length).toBe(1);
    expect(element?.observations?.[0].zoneId).toBe("dog.hindlimb.left.knee");
    expect(element?.observations?.[0].presetId).toBe("tension");
  });

  test("noter une zone déjà notée la re-type au lieu de la dupliquer", async ({ page }) => {
    const title = `${testTitle} Retype`;
    await createDocumentWithDiagram(page, title);

    await page.getByRole("button", { name: await presetLabel("restriction"), exact: true }).click();
    await page.locator('[data-zone-id="dog.spine.sacrum"]').first().click();
    await page.waitForTimeout(800);

    await page.getByRole("button", { name: await presetLabel("tension"), exact: true }).click();
    await page.locator('[data-zone-id="dog.spine.sacrum"]').first().click();
    await page.waitForTimeout(2500);

    const element = await readAnatomyElement(title);
    expect(element?.observations?.length).toBe(1);
    expect(element?.observations?.[0].presetId).toBe("tension");
  });

  test("changer de vue persiste et expose les zones du côté droit", async ({ page }) => {
    const title = `${testTitle} Vue`;
    await createDocumentWithDiagram(page, title);

    await page.getByRole("button", { name: "Latérale droite", exact: true }).click();
    await page.waitForTimeout(2500);

    const element = await readAnatomyElement(title);
    expect(element?.viewId).toBe("dog.lateral-right");
    await expect(page.locator('[data-zone-id="dog.hindlimb.right.knee"]').first()).toBeVisible();
    await expect(page.locator('[data-zone-id="dog.hindlimb.left.knee"]')).toHaveCount(0);
  });

  test("supprimer une observation la retire réellement du document", async ({ page }) => {
    const title = `${testTitle} Suppr`;
    await createDocumentWithDiagram(page, title);

    await page.getByRole("button", { name: await presetLabel("restriction"), exact: true }).click();
    await page.locator('[data-zone-id="dog.spine.lumbar"]').first().click();
    await page.waitForTimeout(800);

    await page.getByRole("button", { name: /Supprimer l’observation Lombaires/ }).click();
    await page.waitForTimeout(2500);

    const element = await readAnatomyElement(title);
    expect(element?.observations).toEqual([]);
  });

  test("masquer les libellés persiste showLabels à false", async ({ page }) => {
    const title = `${testTitle} Libelles`;
    await createDocumentWithDiagram(page, title);

    await page.getByLabel("Afficher les libellés").uncheck();
    await page.waitForTimeout(2500);

    const element = await readAnatomyElement(title);
    expect(element?.showLabels).toBe(false);
  });
});
