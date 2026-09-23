import { createHash } from "node:crypto";
import type { Page } from "@playwright/test";
import type { SqlTag } from "./sql";

/**
 * Compte de plateforme (super-administration) créé pour un test, hors de tout
 * cabinet, avec la double authentification — obligatoire pour ce rôle.
 *
 * Chaque spec passe sa propre adresse : deux specs qui tournent en parallèle
 * ne se partagent jamais ce compte, ni ne le suppriment l'une à l'autre.
 */
export const PLATFORM_PASSWORD = "Plateforme-E2E-2026!";
const KNOWN_CODE = "481516";

function hashToken(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export async function createPlatformAccount(sql: SqlTag, email: string): Promise<string> {
  await removePlatformAccount(sql, email);
  const bcrypt = (await import("bcryptjs")).default;
  const [row] = await sql`
    INSERT INTO "User" (id, email, "passwordHash", "firstName", "lastName", role, permissions, "platformAdmin", "twoFactorEnabled", "organizationId", "updatedAt")
    VALUES (${`plateforme-e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`}, ${email}, ${await bcrypt.hash(PLATFORM_PASSWORD, 10)}, 'Plateforme', 'Test', 'PRACTITIONER', ARRAY[]::text[], true, true, NULL, now())
    RETURNING id`;
  return row.id as string;
}

export async function removePlatformAccount(sql: SqlTag, email: string): Promise<void> {
  const rows = await sql`SELECT id FROM "User" WHERE email = ${email}`;
  for (const row of rows) {
    await sql`UPDATE "Invitation" SET "createdById" = NULL WHERE "createdById" = ${row.id}`;
    await sql`DELETE FROM "AuditLog" WHERE "impersonatorId" = ${row.id} OR "userId" = ${row.id}`;
    await sql`DELETE FROM "Session" WHERE "impersonatorId" = ${row.id} OR "userId" = ${row.id}`;
    await sql`DELETE FROM "User" WHERE id = ${row.id}`;
  }
}

/** Connexion du compte de plateforme, double authentification comprise, jusqu'à /plateforme. */
export async function loginAsPlatform(page: Page, sql: SqlTag, platformId: string, email: string): Promise<void> {
  await sql`DELETE FROM "RateLimitEvent" WHERE key LIKE 'login:%'`;
  await sql`DELETE FROM "TwoFactorCode" WHERE "userId" = ${platformId}`;
  await page.goto("/login", { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', PLATFORM_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/login/verification**", { timeout: 15000 });
  await sql`
    UPDATE "TwoFactorCode" SET "codeHash" = ${hashToken(KNOWN_CODE)}
    WHERE id = (SELECT id FROM "TwoFactorCode" WHERE "userId" = ${platformId} AND "usedAt" IS NULL ORDER BY "createdAt" DESC LIMIT 1)`;
  await page.fill('input[name="code"]', KNOWN_CODE);
  await page.getByRole("button", { name: "Valider" }).click();
  // Sans cabinet, l'espace professionnel renvoie vers la super-administration.
  await page.waitForURL("**/plateforme**", { timeout: 15000 });
}
