import { createHash } from "node:crypto";
import { expect, test, type Page } from "../helpers/test";
import { neon } from "../helpers/sql";
import { config } from "dotenv";

config({ path: ".env.local" });
const sql = neon(process.env.DATABASE_URL!);

/**
 * Chantier 18 des correctifs de l'audit 2026-10 — « Mon compte »
 * (FONC-03, SEC-04, SEC-07). Un compte jetable : changer le mot de passe
 * déconnecte ses autres sessions, ce qui casserait la session partagée des
 * autres specs.
 */

const ORG = "org-1002-pattes";
const EMAIL = `audit-compte-${Date.now()}@example.fr`;
const OLD_PASSWORD = "Ancien-Mot2passe!";
const NEW_PASSWORD = "Nouveau-Mot2passe!";
let userId = "";

async function login(page: Page, password: string) {
  await page.goto("/login");
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  const bcrypt = (await import("bcryptjs")).default;
  const [row] = await sql`
    INSERT INTO "User" (id, email, "passwordHash", "firstName", "lastName", role, permissions, "organizationId", "updatedAt")
    VALUES (${`audit-compte-${Date.now()}`}, ${EMAIL}, ${await bcrypt.hash(OLD_PASSWORD, 10)}, 'Compte', 'AuditCompte', 'PRACTITIONER', ARRAY[]::text[], ${ORG}, now())
    RETURNING id`;
  userId = row.id;
});

test.afterAll(async () => {
  await sql`DELETE FROM "TwoFactorCode" WHERE "userId" = ${userId}`;
  await sql`DELETE FROM "Session" WHERE "userId" = ${userId}`;
  await sql`DELETE FROM "PasswordResetToken" WHERE "userId" = ${userId}`;
  await sql`DELETE FROM "AuditLog" WHERE "userId" = ${userId} OR "entityId" = ${userId}`;
  await sql`DELETE FROM "User" WHERE id = ${userId}`;
});

test("FONC-03 — changer son mot de passe : l'ancien ne vaut plus, les autres appareils sont déconnectés", async ({ browser }) => {
  // Un « autre appareil » : une seconde session ouverte avant le changement.
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await login(otherPage, OLD_PASSWORD);
  await otherPage.waitForURL("**/dashboard**");

  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page, OLD_PASSWORD);
  await page.waitForURL("**/dashboard**");
  await page.goto("/dashboard/compte");
  await page.fill('input[name="currentPassword"]', OLD_PASSWORD);
  await page.fill('input[name="newPassword"]', NEW_PASSWORD);
  await page.fill('input[name="confirmPassword"]', NEW_PASSWORD);
  await page.getByRole("button", { name: "Changer le mot de passe" }).click();
  await expect(page.getByText("Mot de passe changé.")).toBeVisible();

  // Cet appareil reste connecté ; l'autre ne l'est plus.
  await page.goto("/dashboard/compte");
  await expect(page.getByRole("heading", { name: "Mon compte" })).toBeVisible();
  await otherPage.goto("/dashboard");
  await otherPage.waitForURL("**/login**");

  // L'ancien mot de passe ne vaut plus, le nouveau si.
  const fresh = await browser.newContext();
  const freshPage = await fresh.newPage();
  await login(freshPage, OLD_PASSWORD);
  await expect(freshPage.getByText("Email ou mot de passe incorrect.")).toBeVisible();
  await login(freshPage, NEW_PASSWORD);
  await freshPage.waitForURL("**/dashboard**");

  // « Déconnecter les autres appareils » : la session de `page` tombe.
  await freshPage.goto("/dashboard/compte");
  await freshPage.getByRole("button", { name: "Déconnecter les autres appareils" }).click();
  await expect(freshPage.getByText(/autre session déconnectée|autres sessions déconnectées/)).toBeVisible();
  await page.goto("/dashboard");
  await page.waitForURL("**/login**");

  await Promise.all([other.close(), context.close(), fresh.close()]);
});

test("SEC-04 — chacun active lui-même sa double authentification, mot de passe à l'appui", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page, NEW_PASSWORD);
  await page.waitForURL("**/dashboard**");
  await page.goto("/dashboard/compte");

  await page.getByLabel("Mot de passe actuel, pour confirmer").fill("faux-mot-de-passe");
  await page.getByRole("button", { name: "Activer la double authentification" }).click();
  await expect(page.getByText("Mot de passe actuel incorrect.")).toBeVisible();

  await page.getByLabel("Mot de passe actuel, pour confirmer").fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "Activer la double authentification" }).click();
  await expect(page.getByText(/Double authentification activée/)).toBeVisible();
  const [row] = await sql`SELECT "twoFactorEnabled" FROM "User" WHERE id = ${userId}`;
  expect(row.twoFactorEnabled).toBe(true);

  // La connexion suivante demande bien un code.
  const next = await browser.newContext();
  const nextPage = await next.newPage();
  await login(nextPage, NEW_PASSWORD);
  await nextPage.waitForURL("**/login/verification**");
  await sql`UPDATE "TwoFactorCode" SET "codeHash" = ${createHash("sha256").update("482913").digest("hex")} WHERE "userId" = ${userId} AND "usedAt" IS NULL`;
  await nextPage.fill('input[name="code"]', "482913");
  await nextPage.getByRole("button", { name: "Valider" }).click();
  await nextPage.waitForURL("**/dashboard**");
  await Promise.all([context.close(), next.close()]);
});
