import { createHash } from "node:crypto";
import { config } from "dotenv";
import { expect, test } from "@playwright/test";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.local" });

/**
 * FIX_PLAN.md item 30(a) : parcours critique non couvert jusqu'ici —
 * connexion, double authentification par email et verrouillage après trop
 * de tentatives. Seul le compte Secrétariat a la double authentification
 * activée (twoFactorEnabled) — le compte Praticien n'en a pas besoin pour
 * ses propres tests. Aucun fournisseur d'email réel n'est configuré en
 * développement (ConsoleEmailProvider se contente d'un console.log,
 * inaccessible depuis les tests) : le code à 6 chiffres est simulé en
 * réécrivant directement le hash en base avec une valeur connue — même
 * mécanisme (sha256, src/lib/auth/tokens.ts) que celui utilisé par
 * l'application elle-même, pas un contournement de la vérification réelle.
 */

const practitionerEmail = "praticien-test@pf-osteo-animale.fr";
const practitionerPassword = "Praticien-Test-2026!";
const secretaryEmail = "secretariat-test@pf-osteo-animale.fr";
const secretaryPassword = "Secretariat-Test-2026!";
const knownCode = "482913";

function hashToken(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function clearRateLimits() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`DELETE FROM "RateLimitEvent" WHERE key LIKE 'login:%'`;
}

async function setKnownTwoFactorCode(email: string): Promise<void> {
  const sql = neon(process.env.DATABASE_URL!);
  const [user] = await sql`SELECT id FROM "User" WHERE email = ${email}`;
  await sql`
    UPDATE "TwoFactorCode" SET "codeHash" = ${hashToken(knownCode)}
    WHERE id = (
      SELECT id FROM "TwoFactorCode"
      WHERE "userId" = ${user.id} AND "usedAt" IS NULL
      ORDER BY "createdAt" DESC LIMIT 1
    )
  `;
}

async function resetTwoFactorAttempts(email: string): Promise<void> {
  const sql = neon(process.env.DATABASE_URL!);
  const [user] = await sql`SELECT id FROM "User" WHERE email = ${email}`;
  await sql`DELETE FROM "TwoFactorCode" WHERE "userId" = ${user.id}`;
}

test.describe("Connexion, double authentification et verrouillage", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async () => {
    await clearRateLimits();
  });

  test("connexion réussie sans double authentification (compte sans 2FA)", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[type="email"]', practitionerEmail);
    await page.fill('input[type="password"]', practitionerPassword);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard**", { timeout: 10000 });
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("mot de passe incorrect affiche une erreur sans révéler si l'email existe", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[type="email"]', practitionerEmail);
    await page.fill('input[type="password"]', "MauvaisMotDePasse123!");
    await page.click('button[type="submit"]');
    await expect(page.locator('p[role="alert"]')).toContainText("Email ou mot de passe incorrect");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("connexion avec un compte à double authentification redirige vers la vérification, pas directement au tableau de bord", async ({ page }) => {
    await resetTwoFactorAttempts(secretaryEmail);
    await page.goto("/login");
    await page.fill('input[type="email"]', secretaryEmail);
    await page.fill('input[type="password"]', secretaryPassword);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/login/verification**", { timeout: 10000 });
    await expect(page.getByRole("heading", { name: "Vérification en deux étapes" })).toBeVisible();
  });

  test("code de vérification correct termine la connexion", async ({ page }) => {
    await resetTwoFactorAttempts(secretaryEmail);
    await page.goto("/login");
    await page.fill('input[type="email"]', secretaryEmail);
    await page.fill('input[type="password"]', secretaryPassword);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/login/verification**", { timeout: 10000 });

    await setKnownTwoFactorCode(secretaryEmail);
    await page.fill('input[name="code"]', knownCode);
    await page.getByRole("button", { name: "Valider" }).click();
    await page.waitForURL("**/dashboard**", { timeout: 10000 });
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("code de vérification incorrect affiche une erreur et ne connecte pas", async ({ page }) => {
    await resetTwoFactorAttempts(secretaryEmail);
    await page.goto("/login");
    await page.fill('input[type="email"]', secretaryEmail);
    await page.fill('input[type="password"]', secretaryPassword);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/login/verification**", { timeout: 10000 });

    await page.fill('input[name="code"]', "000000");
    await page.getByRole("button", { name: "Valider" }).click();
    await expect(page.locator('p[role="alert"]')).toContainText("Code incorrect");
    await expect(page).toHaveURL(/\/login\/verification/);
  });

  test("5 codes incorrects verrouillent la vérification jusqu'à un nouveau code", async ({ page }) => {
    await resetTwoFactorAttempts(secretaryEmail);
    await page.goto("/login");
    await page.fill('input[type="email"]', secretaryEmail);
    await page.fill('input[type="password"]', secretaryPassword);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/login/verification**", { timeout: 10000 });

    // "Code incorrect." reste le texte affiché à chaque tentative : attendre
    // sa seule (dis)apparition ne garantit pas que CETTE soumission-ci s'est
    // terminée, seulement qu'une réponse l'a déjà affiché à un moment donné
    // — sans attendre explicitement le bouton réactivé, l'itération suivante
    // peut partir avant que la server action précédente ait fini d'incrémenter
    // le compteur en base.
    const submitButton = page.getByRole("button", { name: "Valider" });
    for (let attempt = 0; attempt < 5; attempt++) {
      await page.fill('input[name="code"]', "111111");
      await submitButton.click();
      await expect(submitButton).toBeEnabled();
      await expect(page.locator('p[role="alert"]')).toContainText("Code incorrect");
      // Filet de sécurité : le bouton réactivé peut suivre de très près le
      // rendu de la réponse plutôt que le compteur réellement incrémenté en
      // base par la server action — une marge courte évite de partir sur
      // l'itération suivante juste avant que l'écriture soit posée.
      await page.waitForTimeout(200);
    }

    // 6e tentative : le code est désormais verrouillé (maxAttempts = 5),
    // même avec le bon code cette fois.
    await setKnownTwoFactorCode(secretaryEmail);
    await page.fill('input[name="code"]', knownCode);
    await page.getByRole("button", { name: "Valider" }).click();
    await expect(page.locator('p[role="alert"]')).toContainText("Trop de tentatives incorrectes");
    await expect(page).toHaveURL(/\/login\/verification/);
  });

  test("trop de tentatives de connexion déclenche le verrouillage par email/IP", async ({ page }) => {
    await page.goto("/login");
    const submitButton = page.locator('button[type="submit"]');
    for (let attempt = 0; attempt < 10; attempt++) {
      await page.fill('input[type="email"]', practitionerEmail);
      await page.fill('input[type="password"]', "MauvaisMotDePasse" + attempt);
      await submitButton.click();
      // "Email ou mot de passe incorrect." reste identique à chaque
      // tentative : attendre sa seule (dis)apparition ne garantit pas que
      // CETTE soumission s'est terminée (voir la même remarque plus haut) —
      // attendre le bouton réactivé + une marge courte avant de compter
      // l'itération suivante.
      await expect(submitButton).toBeEnabled();
      await expect(page.locator('p[role="alert"]')).toContainText("Email ou mot de passe incorrect");
      await page.waitForTimeout(200);
    }

    // 11e tentative, même avec le bon mot de passe cette fois : verrouillée.
    await page.fill('input[type="email"]', practitionerEmail);
    await page.fill('input[type="password"]', practitionerPassword);
    await page.click('button[type="submit"]');
    await expect(page.locator('p[role="alert"]')).toContainText("Trop de tentatives");
    await expect(page).toHaveURL(/\/login$/);
  });

  test.afterEach(async () => {
    await clearRateLimits();
    await resetTwoFactorAttempts(secretaryEmail);
  });
});
