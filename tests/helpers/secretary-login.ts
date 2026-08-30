import { createHash } from "node:crypto";
import { config } from "dotenv";
import type { Page } from "@playwright/test";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.local" });

/**
 * Connexion réelle au compte de test Secrétariat (double authentification
 * activée) — voir la même note que tests/auth-login-2fa.spec.ts : aucun
 * fournisseur d'email réel en développement, le code à 6 chiffres est donc
 * simulé en réécrivant son hash en base avec une valeur connue, avec le même
 * algorithme (sha256) que l'application elle-même.
 */
export const secretaryEmail = "secretariat-test@pf-osteo-animale.fr";
const secretaryPassword = "Secretariat-Test-2026!";
const knownCode = "739201";

function hashToken(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export async function loginAsSecretary(page: Page): Promise<void> {
  const sql = neon(process.env.DATABASE_URL!);
  const [user] = await sql`SELECT id FROM "User" WHERE email = ${secretaryEmail}`;
  await sql`DELETE FROM "TwoFactorCode" WHERE "userId" = ${user.id}`;
  await sql`DELETE FROM "RateLimitEvent" WHERE key LIKE 'login:%'`;

  await page.goto("/login");
  await page.fill('input[type="email"]', secretaryEmail);
  await page.fill('input[type="password"]', secretaryPassword);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/login/verification**", { timeout: 10000 });

  await sql`
    UPDATE "TwoFactorCode" SET "codeHash" = ${hashToken(knownCode)}
    WHERE id = (
      SELECT id FROM "TwoFactorCode"
      WHERE "userId" = ${user.id} AND "usedAt" IS NULL
      ORDER BY "createdAt" DESC LIMIT 1
    )
  `;
  await page.fill('input[name="code"]', knownCode);
  await page.getByRole("button", { name: "Valider" }).click();
  await page.waitForURL("**/dashboard**", { timeout: 10000 });
}
