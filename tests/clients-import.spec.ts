import { config } from "dotenv";
import { expect, test } from "@playwright/test";
import { neon } from "@neondatabase/serverless";
import AxeBuilder from "@axe-core/playwright";

config({ path: ".env.local" });

/**
 * PROMPT-IMPORT-CLIENTS.md, phase 4 : suite E2E de l'assistant d'import de
 * fichiers clients. Même style que tests/client-animal-crud.spec.ts —
 * vérification de l'état réel en base, pas seulement du DOM.
 */

const testEmail = "praticien-test@pf-osteo-animale.fr";
const testPassword = "Praticien-Test-2026!";

async function cleanupE2eData() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`DELETE FROM "Animal" WHERE "clientId" IN (SELECT id FROM "Client" WHERE email LIKE '%.e2e@example.fr')`;
  await sql`DELETE FROM "Client" WHERE email LIKE '%.e2e@example.fr'`;
}

async function openImportModal(page: import("@playwright/test").Page) {
  await page.goto("/dashboard/clients");
  await page.getByRole("button", { name: "Importer des clients" }).click();
  return page.locator('[role="dialog"]').first();
}

test.describe("Import de fichiers clients", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async ({ page }) => {
    const sql = neon(process.env.DATABASE_URL!);
    await sql`DELETE FROM "RateLimitEvent" WHERE key LIKE 'login:%' OR key LIKE 'client-import:%'`;
    await cleanupE2eData();
    await page.goto("/login");
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', testPassword);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard**", { timeout: 10000 });
  });

  test.afterEach(async () => {
    await cleanupE2eData();
  });

  test("CSV `;` en UTF-8 accentué crée les bons clients et animaux", async ({ page }) => {
    const dialog = await openImportModal(page);
    await dialog.locator('input[type="file"]').setInputFiles("tests/fixtures/clients-import/basic-fr.csv");

    await expect(dialog.getByText("2. Colonnes")).toBeVisible({ timeout: 10000 });
    // Les accents doivent être corrects dans l'aperçu de mapping (D3) — pas
    // de "PrÃ©nom" ni de "CÃ©line" trahissant un mauvais décodage.
    await expect(dialog.getByText("Céline").first()).toBeVisible();
    await expect(dialog.getByText("Bérénice").first()).toBeVisible();
    await dialog.getByRole("button", { name: "Continuer" }).click();

    await expect(dialog.getByText("3. Vérification")).toBeVisible({ timeout: 10000 });
    await expect(dialog.getByText("Vérification des fiches déjà existantes")).toHaveCount(0, { timeout: 10000 });

    const importButton = dialog.getByRole("button", { name: /Importer \d+ client/ });
    await expect(importButton).toHaveText("Importer 3 clients");
    await importButton.click();

    await expect(dialog.getByText("Clients créés")).toBeVisible({ timeout: 15000 });

    const sql = neon(process.env.DATABASE_URL!);
    const clients = await sql`SELECT "firstName", "lastName" FROM "Client" WHERE email LIKE '%.e2e@example.fr'`;
    expect(clients.length).toBe(3);
    const fullNames = clients.map((client) => `${client.firstName} ${client.lastName}`).sort();
    expect(fullNames).toEqual(["Antoine Léger", "Bérénice Dubœuf", "Céline Lefèvre"]);

    const animals = await sql`SELECT a.name FROM "Animal" a JOIN "Client" c ON c.id = a."clientId" WHERE c.email LIKE '%.e2e@example.fr'`;
    expect(animals.length).toBe(4);
  });

  test("politique COMPLETE : complète une fiche existante sans la dupliquer, sans écraser un champ déjà rempli", async ({ page }) => {
    const sql = neon(process.env.DATABASE_URL!);
    const [existing] = await sql`
      INSERT INTO "Client" (id, "firstName", "lastName", phone, email, city, address, "updatedAt")
      VALUES ('e2e-import-isabelle', 'Isabelle', 'Roussel', '', 'isabelle.roussel.e2e@example.fr', 'Caen', '', now())
      RETURNING id
    `;

    const dialog = await openImportModal(page);
    await dialog.locator('input[type="file"]').setInputFiles("tests/fixtures/clients-import/duplicate-fr.csv");

    await expect(dialog.getByText("2. Colonnes")).toBeVisible({ timeout: 10000 });
    await dialog.getByRole("button", { name: "Continuer" }).click();

    await expect(dialog.getByText("3. Vérification")).toBeVisible({ timeout: 10000 });
    await expect(dialog.getByText("Vérification des fiches déjà existantes")).toHaveCount(0, { timeout: 10000 });
    // COMPLETE est la politique par défaut : la ligne doit être reconnue
    // comme correspondant à une fiche déjà en base.
    await expect(dialog.getByText("Complété", { exact: true })).toBeVisible();

    await dialog.getByRole("button", { name: /Importer \d+ client/ }).click();
    await expect(dialog.getByText("Clients créés")).toBeVisible({ timeout: 15000 });

    const matches = await sql`SELECT phone, city, address FROM "Client" WHERE email = 'isabelle.roussel.e2e@example.fr'`;
    expect(matches.length).toBe(1); // toujours une seule fiche, pas de doublon créé
    expect(matches[0].phone).toBe("06 11 22 33 44"); // champ vide → complété
    expect(matches[0].address).toBe("10 rue Test"); // champ vide → complété
    expect(matches[0].city).toBe("Caen"); // champ déjà rempli → jamais écrasé, malgré "AUTRE VILLE" dans le fichier

    await sql`DELETE FROM "Client" WHERE id = ${existing.id}`;
  });

  test("une ligne sans nom est comptée en erreur sans bloquer l'import des autres lignes", async ({ page }) => {
    const dialog = await openImportModal(page);
    await dialog.locator('input[type="file"]').setInputFiles("tests/fixtures/clients-import/with-error-row.csv");

    await expect(dialog.getByText("2. Colonnes")).toBeVisible({ timeout: 10000 });
    await dialog.getByRole("button", { name: "Continuer" }).click();

    await expect(dialog.getByText("3. Vérification")).toBeVisible({ timeout: 10000 });
    await expect(dialog.getByText("Vérification des fiches déjà existantes")).toHaveCount(0, { timeout: 10000 });

    const importButton = dialog.getByRole("button", { name: /Importer \d+ client/ });
    // Une seule ligne valide (Julien Fabre) sur les deux du fichier — la
    // ligne sans nom n'est pas comptée dans ce qui sera réellement importé.
    await expect(importButton).toHaveText("Importer 1 client");
    await importButton.click();

    await expect(dialog.getByText("Clients créés")).toBeVisible({ timeout: 15000 });

    const sql = neon(process.env.DATABASE_URL!);
    const julien = await sql`SELECT id FROM "Client" WHERE email = 'julien.fabre.e2e@example.fr'`;
    expect(julien.length).toBe(1);
    const nino = await sql`SELECT count(*)::int AS count FROM "Animal" WHERE "clientId" = ${julien[0].id} AND name = 'Nino'`;
    expect(nino[0].count).toBe(1);

    const fantome = await sql`SELECT count(*)::int AS count FROM "Animal" WHERE name = 'Fantome'`;
    expect(fantome[0].count).toBe(0);
  });

  test("annuler un import supprime les fiches créées, sans toucher aux fiches préexistantes", async ({ page }) => {
    const sql = neon(process.env.DATABASE_URL!);
    const [existing] = await sql`
      INSERT INTO "Client" (id, "firstName", "lastName", phone, email, city, address, "updatedAt")
      VALUES ('e2e-import-veronique', 'Véronique', 'Caron', '', 'veronique.caron.e2e@example.fr', 'Caen', '1 impasse Ancienne', now())
      RETURNING id
    `;

    const dialog = await openImportModal(page);
    await dialog.locator('input[type="file"]').setInputFiles("tests/fixtures/clients-import/undo-scenario.csv");

    await expect(dialog.getByText("2. Colonnes")).toBeVisible({ timeout: 10000 });
    await dialog.getByRole("button", { name: "Continuer" }).click();
    await expect(dialog.getByText("3. Vérification")).toBeVisible({ timeout: 10000 });
    await expect(dialog.getByText("Vérification des fiches déjà existantes")).toHaveCount(0, { timeout: 10000 });
    await dialog.getByRole("button", { name: /Importer \d+ client/ }).click();
    await expect(dialog.getByText("Clients créés")).toBeVisible({ timeout: 15000 });

    // Sandrine (nouvelle) et l'animal Pilou ajouté à Véronique (préexistante) existent bien.
    const sandrine = await sql`SELECT id FROM "Client" WHERE email = 'sandrine.blot.e2e@example.fr'`;
    expect(sandrine.length).toBe(1);
    const pilouBefore = await sql`SELECT count(*)::int AS count FROM "Animal" WHERE "clientId" = ${existing.id} AND name = 'Pilou'`;
    expect(pilouBefore[0].count).toBe(1);

    await dialog.getByRole("button", { name: "Annuler cet import" }).click();
    const confirmDialog = page.locator('[role="dialog"]').filter({ hasText: "Annuler cet import ?" });
    await confirmDialog.getByRole("button", { name: "Annuler l'import" }).click();
    await expect(dialog.getByText("Import annulé")).toBeVisible({ timeout: 10000 });

    // Sandrine et son animal ont disparu…
    const sandrineAfter = await sql`SELECT id FROM "Client" WHERE email = 'sandrine.blot.e2e@example.fr'`;
    expect(sandrineAfter.length).toBe(0);
    const titanAfter = await sql`SELECT count(*)::int AS count FROM "Animal" WHERE name = 'Titan'`;
    expect(titanAfter[0].count).toBe(0);

    // …Pilou (rattaché à une fiche préexistante) aussi, mais la fiche de
    // Véronique elle-même — jamais créée par cet import — reste intacte.
    const pilouAfter = await sql`SELECT count(*)::int AS count FROM "Animal" WHERE "clientId" = ${existing.id} AND name = 'Pilou'`;
    expect(pilouAfter[0].count).toBe(0);
    const veroniqueAfter = await sql`SELECT city, address FROM "Client" WHERE id = ${existing.id}`;
    expect(veroniqueAfter.length).toBe(1);
    expect(veroniqueAfter[0].city).toBe("Caen");

    await sql`DELETE FROM "Client" WHERE id = ${existing.id}`;
  });

  test("accessibilité et clavier : pas de violation axe-core critique, étapes 2 à 4 utilisables au clavier seul", async ({ page }) => {
    const dialog = await openImportModal(page);
    // Le choix du fichier passe par la boîte de dialogue native de l'OS,
    // hors de portée du clavier scripté par Playwright (limitation connue,
    // pas de l'application) — setInputFiles() est la façon standard de
    // fournir un fichier dans ce cas. Le déclenchement au clavier de la zone
    // de dépôt elle-même (Entrée/Espace sur le div role="button") est du
    // code trivial déjà revu, non ré-exercé ici.
    await dialog.locator('input[type="file"]').setInputFiles("tests/fixtures/clients-import/basic-fr.csv");
    await expect(dialog.getByText("2. Colonnes")).toBeVisible({ timeout: 10000 });

    const step2 = await new AxeBuilder({ page }).include('[role="dialog"]').analyze();
    const step2Issues = step2.violations.filter((violation) => violation.impact === "critical" || violation.impact === "serious");
    expect(step2Issues, JSON.stringify(step2Issues, null, 2)).toEqual([]);

    await dialog.getByRole("button", { name: "Continuer" }).focus();
    await page.keyboard.press("Enter");

    await expect(dialog.getByText("3. Vérification")).toBeVisible({ timeout: 10000 });
    await expect(dialog.getByText("Vérification des fiches déjà existantes")).toHaveCount(0, { timeout: 10000 });

    const step3 = await new AxeBuilder({ page }).include('[role="dialog"]').analyze();
    const step3Issues = step3.violations.filter((violation) => violation.impact === "critical" || violation.impact === "serious");
    expect(step3Issues, JSON.stringify(step3Issues, null, 2)).toEqual([]);

    // Politique de doublon : un bouton radio natif, opérable au clavier.
    const ignoreRadio = dialog.getByRole("radio").nth(1);
    await ignoreRadio.focus();
    await page.keyboard.press("Space");
    await expect(ignoreRadio).toBeChecked();

    const importButton = dialog.getByRole("button", { name: /Importer \d+ client/ });
    await importButton.focus();
    await page.keyboard.press("Enter");
    await expect(dialog.getByText("Clients créés")).toBeVisible({ timeout: 15000 });

    // Échap ferme la fenêtre en dehors d'un import actif (ici déjà terminé).
    await page.keyboard.press("Escape");
    await expect(page.locator('[role="dialog"]')).toHaveCount(0, { timeout: 5000 });
  });
});
