import { createHash } from "node:crypto";
import { unzipSync } from "fflate";
import { expect, test } from "../helpers/test";
import { neon } from "../helpers/sql";
import { createPlatformAccount, loginAsPlatform, removePlatformAccount } from "../helpers/platform";
import { config } from "dotenv";
import { BASE_URL } from "../helpers/base-url";

config({ path: ".env.local" });
const sql = neon(process.env.DATABASE_URL!);

/**
 * Chantier 21 des correctifs de l'audit 2026-10 — parcours critiques sans
 * test (TEST-02) : la page de réinitialisation du mot de passe, l'export
 * d'un espace par la plateforme, le retour de Google Agenda.
 */

const ORG = "org-1002-pattes";
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

test.describe("réinitialisation du mot de passe", () => {
  const email = `audit-reinit-${Date.now()}@example.fr`;
  const token = `jeton-audit-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const newPassword = "Reinitialise-2026!";
  let userId = "";

  test.beforeAll(async () => {
    const bcrypt = (await import("bcryptjs")).default;
    const [row] = await sql`
      INSERT INTO "User" (id, email, "passwordHash", "firstName", "lastName", role, permissions, "organizationId", "updatedAt")
      VALUES (${`audit-reinit-${Date.now()}`}, ${email}, ${await bcrypt.hash("Ancien-Passe-2026!", 10)}, 'Reinit', 'Audit', 'PRACTITIONER', ARRAY[]::text[], ${ORG}, now())
      RETURNING id`;
    userId = row.id;
    await sql`INSERT INTO "PasswordResetToken" (id, "userId", "tokenHash", "expiresAt") VALUES (${`audit-reinit-token-${Date.now()}`}, ${userId}, ${hash(token)}, ${new Date(Date.now() + 30 * 60 * 1000).toISOString()}::timestamptz AT TIME ZONE 'UTC')`;
  });

  test.afterAll(async () => {
    await sql`DELETE FROM "PasswordResetToken" WHERE "userId" = ${userId}`;
    await sql`DELETE FROM "Session" WHERE "userId" = ${userId}`;
    await sql`DELETE FROM "AuditLog" WHERE "userId" = ${userId}`;
    await sql`DELETE FROM "User" WHERE id = ${userId}`;
  });

  test("le lien choisit un nouveau mot de passe, une seule fois", async ({ page }) => {
    await page.goto(`/reinitialiser-mot-de-passe?token=${token}`);
    await page.locator('input[name="password"]').fill(newPassword);
    await page.locator('input[name="confirmPassword"]').fill(newPassword);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL("**/login?reset=ok**");

    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', newPassword);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard**");

    // Le même lien ne sert plus.
    const again = await page.context().browser()!.newContext();
    const againPage = await again.newPage();
    await againPage.goto(`/reinitialiser-mot-de-passe?token=${token}`);
    await againPage.locator('input[name="password"]').fill("Encore-Une-Fois-2026!");
    await againPage.locator('input[name="confirmPassword"]').fill("Encore-Une-Fois-2026!");
    await againPage.locator('button[type="submit"]').click();
    await expect(againPage.getByText("Ce lien de réinitialisation est invalide ou a expiré.")).toBeVisible();
    await again.close();
  });
});

test.describe("export d'un espace par la plateforme", () => {
  const email = `audit-export-plateforme-${Date.now()}@example.fr`;
  let platformId = "";
  test.beforeAll(async () => { platformId = await createPlatformAccount(sql, email); });
  test.afterAll(async () => {
    await sql`DELETE FROM "AuditLog" WHERE action = 'ORGANIZATION_EXPORTED' AND "createdAt" > now() - interval '1 hour' AND "organizationId" = ${ORG}`;
    await removePlatformAccount(sql, email);
  });

  test("le ZIP contient les tables et les tableurs de l'espace, et seulement avec l'accès plateforme", async ({ page }) => {
    const anonymous = await fetch(`${BASE_URL}/plateforme/export/${ORG}`, { redirect: "manual" });
    expect(anonymous.status, "sans accès, l'adresse n'existe pas").toBe(404);

    await loginAsPlatform(page, sql, platformId, email);
    const cookie = (await page.context().cookies()).map((c) => `${c.name}=${c.value}`).join("; ");
    const response = await fetch(`${BASE_URL}/plateforme/export/${ORG}`, { headers: { Cookie: cookie } });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/zip");
    const files = Object.keys(unzipSync(new Uint8Array(await response.arrayBuffer())));
    for (const name of ["clients.csv", "animaux.csv", "rendez-vous.csv"]) expect(files, name).toContain(name);
    expect(files.some((name) => name.startsWith("donnees/")), "une table par fichier JSON").toBe(true);
  });
});

test.describe("retour de Google Agenda", () => {
  test.use({ storageState: "tests/.auth/practitioner.json" });

  test("un « state » falsifié ne relie rien", async ({ page }) => {
    const before = await sql`SELECT count(*)::int AS n FROM "CalendarConnection"`;
    await page.goto("/api/calendar/google/callback?code=faux-code&state=faux-state");
    await expect(page).toHaveURL(/google_error=invalid_state/);
    const after = await sql`SELECT count(*)::int AS n FROM "CalendarConnection"`;
    expect(after[0].n, "aucune connexion créée").toBe(before[0].n);
  });
});
