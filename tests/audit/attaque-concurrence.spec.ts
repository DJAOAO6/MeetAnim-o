import { createHash } from "node:crypto";
import { expect, test } from "../helpers/test";
import { neon } from "../helpers/sql";
import { config } from "dotenv";
import { BASE_URL } from "../helpers/base-url";

config({ path: ".env.local" });
const sql = neon(process.env.DATABASE_URL!);
const BASE = BASE_URL;

/**
 * Phase 3 — Profil 6 : des requêtes envoyées en même temps, contre la double
 * authentification par code email.
 *
 * Écrit en phase 3 comme preuve de `SEC-01` (docs/audit-2026-10/02-SECURITE-CODE.md),
 * retourné après correction en test de non-régression : le compteur d'essais
 * tient face à des requêtes simultanées, et les renvois de code sont limités.
 *
 * Un espace jetable, pour ne consommer le quota de connexions d'aucun autre
 * essai de cette phase.
 */

const MARKER = "AUDIT3";
const ORG = "org-audit-phase3-2fa";
const EMAIL = "audit-phase3-2fa@example.fr";
const PASSWORD = "Audit-Phase3-2026!";

function hashToken(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function cleanup() {
  await sql`DELETE FROM "TwoFactorCode" WHERE "userId" IN (SELECT id FROM "User" WHERE "organizationId" = ${ORG})`;
  await sql`DELETE FROM "Session" WHERE "userId" IN (SELECT id FROM "User" WHERE "organizationId" = ${ORG})`;
  await sql`DELETE FROM "AuditLog" WHERE "userId" IN (SELECT id FROM "User" WHERE "organizationId" = ${ORG})`;
  await sql`DELETE FROM "User" WHERE "organizationId" = ${ORG}`;
  await sql`DELETE FROM "Organization" WHERE id = ${ORG}`;
}

function cookieOf(cookies: { name: string; value: string }[]): string {
  return cookies.map((c) => `${c.name}=${c.value}`).join("; ");
}

/** `resendTwoFactorCode` ne prend aucun argument : un appel direct simple, sans formulaire. */
async function callResend(id: string, cookie: string) {
  const response = await fetch(`${BASE}/login/verification`, {
    method: "POST",
    redirect: "manual",
    headers: { "Next-Action": id, "Content-Type": "text/plain;charset=UTF-8", Accept: "text/x-component", Origin: BASE, Cookie: cookie },
    body: JSON.stringify([]),
  });
  return { status: response.status };
}

test.describe.configure({ mode: "serial" });

let cookie = "";
let userId = "";
let resendActionId = "";

test.beforeAll(async () => {
  await cleanup();
  const bcrypt = (await import("bcryptjs")).default;
  await sql`INSERT INTO "Organization" (id, name, "createdAt", "updatedAt") VALUES (${ORG}, ${`${MARKER} 2FA`}, now(), now())`;
  const [row] = await sql`
    INSERT INTO "User" (id, email, "passwordHash", "firstName", "lastName", role, permissions, "organizationId", "twoFactorEnabled", "updatedAt")
    VALUES (${`${ORG}-user-${Date.now()}`}, ${EMAIL}, ${await bcrypt.hash(PASSWORD, 10)}, 'Audit', ${MARKER}, 'PRACTITIONER', ARRAY[]::text[], ${ORG}, true, now())
    RETURNING id`;
  userId = row.id as string;
});

test.afterAll(async () => { await cleanup(); });

test("le compteur d'essais tient face à des essais envoyés en même temps", async ({ page }) => {
  // La connexion (page fixture, par test) ne peut pas se faire dans
  // beforeAll : c'est ce premier essai qui l'ouvre, les suivants réutilisent
  // le cookie obtenu ici.
  await page.goto("/login");
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/login/verification**", { timeout: 15000 });
  cookie = cookieOf(await page.context().cookies());

  // `resendTwoFactorCode` n'a pas de FormData : son identifiant s'extrait
  // comme pour une action ordinaire.
  const html = await (await fetch(`${BASE}/login/verification`, { headers: { Cookie: cookie } })).text();
  for (const chunk of [...new Set(html.match(/\/_next\/static\/[^"'\s]+\.js/g) ?? [])]) {
    const js = await (await fetch(`${BASE}${chunk}`)).text();
    for (const m of js.matchAll(/"([0-9a-f]{40,})":\{"name":"resendTwoFactorCode"\}/g)) resendActionId = m[1];
  }

  // Un premier essai réel de navigateur, intercepté, fournit le corps exact
  // (multipart, limite comprise) que React envoie pour cette action de
  // formulaire (`useActionState`) : vingt requêtes construites à la main ne
  // reproduiraient pas fidèlement ce protocole. Rejoué ensuite à l'identique
  // par vingt requêtes directes, sans passer par vingt onglets — leur temps
  // de chargement et d'hydratation espaçait trop les essais réels pour que
  // la course se produise.
  const captured = page.waitForRequest((req) => req.url().includes("/login/verification") && req.method() === "POST");
  await page.goto("/login/verification");
  await page.fill('input[name="code"]', "000000");
  await page.getByRole("button", { name: "Valider" }).click();
  const request = await captured;
  const capturedHeaders = await request.allHeaders();
  const body = request.postDataBuffer();
  expect(body, "corps de la requête capturée").toBeTruthy();
  // Repris tel quel (limite comprise), sauf ce que `fetch` recalcule lui-même.
  const forwardedHeaders = { ...capturedHeaders };
  delete forwardedHeaders["content-length"];
  delete forwardedHeaders["host"];

  // Remis à zéro : le clic ci-dessus, déjà compté, ne doit pas fausser le
  // relevé des vingt essais qui suivent.
  await sql`
    UPDATE "TwoFactorCode" SET "codeHash" = ${hashToken("552881")}, attempts = 0
    WHERE id = (SELECT id FROM "TwoFactorCode" WHERE "userId" = ${userId} AND "usedAt" IS NULL ORDER BY "createdAt" DESC LIMIT 1)`;
  await sql`DELETE FROM "AuditLog" WHERE "userId" = ${userId} AND action = 'TWO_FACTOR_FAILED'`;

  await Promise.all(
    Array.from({ length: 20 }, () => fetch(request.url(), { method: "POST", redirect: "manual", headers: forwardedHeaders, body: new Uint8Array(body!) })),
  );

  // Preuve en base, pas à l'écran : chaque essai refusé pour mauvais code
  // journalise `TWO_FACTOR_FAILED` avec `reason: "invalid_code"`
  // (src/lib/auth/two-factor-actions.ts:46) ; chaque essai refusé pour
  // compteur atteint journalise `reason: "max_attempts"` sans toucher au
  // compteur. Compter l'un et l'autre dit combien de requêtes ont
  // réellement été traitées comme « encore sous la limite ».
  const counts = await sql`
    SELECT metadata->>'reason' AS reason, count(*)::int AS n
    FROM "AuditLog" WHERE "userId" = ${userId} AND action = 'TWO_FACTOR_FAILED'
    GROUP BY metadata->>'reason'`;
  const invalidCode = (counts.find((r) => r.reason === "invalid_code")?.n ?? 0) as number;

  const [row] = await sql`SELECT attempts FROM "TwoFactorCode" WHERE "userId" = ${userId} AND "usedAt" IS NULL ORDER BY "createdAt" DESC LIMIT 1`;
  // Relevé consigné dans docs/audit-2026-10/03-ATTAQUES.md.
  console.log(`[SEC-01] 20 essais simultanés : ${invalidCode} traités comme « code incorrect », ${counts.find((r) => r.reason === "max_attempts")?.n ?? 0} refusés pour limite atteinte, compteur final ${row.attempts}`);

  // Au plus cinq essais réellement jugés sur ce code (`maxAttempts`), quel
  // que soit le nombre de requêtes simultanées : l'essai est compté avant
  // d'être jugé, par une écriture conditionnelle. Avant correction : 12.
  expect(invalidCode, "essais journalisés comme « code incorrect », sur vingt envoyés ensemble").toBeLessThanOrEqual(5);
  expect(row.attempts as number, "compteur final en base, après vingt essais envoyés ensemble").toBeLessThanOrEqual(5);
});

test("resendTwoFactorCode est limité à trois codes par quart d'heure", async () => {
  expect(resendActionId, "action resendTwoFactorCode trouvée").toBeTruthy();

  const before = (await sql`SELECT count(*)::int AS n FROM "TwoFactorCode" WHERE "userId" = ${userId}`)[0].n as number;
  // Six renvois à la suite : les trois premiers passent (contrôle positif :
  // le renvoi fonctionne), les suivants sont refusés sans créer de code.
  for (let i = 0; i < 6; i++) {
    const result = await callResend(resendActionId, cookie);
    expect(result.status, `renvoi n°${i + 1} non refusé`).toBeLessThan(400);
  }
  const after = (await sql`SELECT count(*)::int AS n FROM "TwoFactorCode" WHERE "userId" = ${userId}`)[0].n as number;

  // Avant correction : six codes créés, aucun refusé.
  expect(after - before, "trois codes créés, les renvois suivants refusés").toBe(3);
});
