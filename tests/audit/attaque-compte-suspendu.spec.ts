import { expect, test } from "../helpers/test";
import { neon } from "../helpers/sql";
import { config } from "dotenv";
import { BASE_URL } from "../helpers/base-url";

config({ path: ".env.local" });
const sql = neon(process.env.DATABASE_URL!);
const BASE = BASE_URL;

/**
 * Phase 3 — Profil 5 : une session déjà ouverte, dont le compte a depuis été
 * suspendu (A) ou dont la session elle-même a été révoquée (B, équivalent
 * d'une session ancienne après déconnexion ou changement de mot de passe).
 *
 * Preuve pour la revérification faite par `getCurrentUser`
 * (src/lib/auth/dal.ts) à chaque requête — partie C de
 * docs/audit-2026-10/02-SECURITE-CODE.md. Deux espaces jetables, un par cas,
 * pour que la suspension de l'un n'empêche pas de tester l'autre.
 */

const MARKER = "AUDIT3";
const PASSWORD = "Audit-Phase3-2026!";
const SUSPENDED_ORG = "org-audit-phase3-suspendu";
const REVOKED_ORG = "org-audit-phase3-revoque";
const SUSPENDED_EMAIL = "audit-phase3-suspendu@example.fr";
const REVOKED_EMAIL = "audit-phase3-revoque@example.fr";

async function cleanup() {
  for (const org of [SUSPENDED_ORG, REVOKED_ORG]) {
    await sql`DELETE FROM "Client" WHERE "organizationId" = ${org}`;
    await sql`DELETE FROM "Session" WHERE "userId" IN (SELECT id FROM "User" WHERE "organizationId" = ${org})`;
    await sql`DELETE FROM "User" WHERE "organizationId" = ${org}`;
    // La première visite du tableau de bord crée un profil vide (voir
    // src/lib/business-profile-actions.ts, getBusinessProfile) et une
    // entrée de journal (connexion) : à nettoyer avant de pouvoir supprimer
    // l'espace.
    await sql`DELETE FROM "BusinessProfile" WHERE "organizationId" = ${org}`;
    await sql`DELETE FROM "AuditLog" WHERE "organizationId" = ${org}`;
    await sql`DELETE FROM "Organization" WHERE id = ${org}`;
  }
}

async function createOrgAndUser(orgId: string, email: string) {
  const bcrypt = (await import("bcryptjs")).default;
  await sql`INSERT INTO "Organization" (id, name, "createdAt", "updatedAt") VALUES (${orgId}, ${`${MARKER} ${orgId}`}, now(), now())`;
  const [row] = await sql`
    INSERT INTO "User" (id, email, "passwordHash", "firstName", "lastName", role, permissions, "organizationId", "updatedAt")
    VALUES (${`${orgId}-user`}, ${email}, ${await bcrypt.hash(PASSWORD, 10)}, 'Audit', ${MARKER}, 'PRACTITIONER', ARRAY[]::text[], ${orgId}, now())
    RETURNING id`;
  return row.id as string;
}

function cookieOf(cookies: { name: string; value: string }[]): string {
  return cookies.map((c) => `${c.name}=${c.value}`).join("; ");
}

async function actionIdOf(name: string, path: string, cookie: string): Promise<string | undefined> {
  const html = await (await fetch(`${BASE}${path}`, { headers: { Cookie: cookie } })).text();
  for (const chunk of [...new Set(html.match(/\/_next\/static\/[^"'\s]+\.js/g) ?? [])]) {
    const js = await (await fetch(`${BASE}${chunk}`)).text();
    for (const m of js.matchAll(/"([0-9a-f]{40,})":\{"name":"(\w+)"\}/g)) if (m[2] === name) return m[1];
  }
  return undefined;
}

async function callCreateClient(id: string, cookie: string, lastName: string) {
  const response = await fetch(`${BASE}/dashboard/clients`, {
    method: "POST",
    redirect: "manual",
    headers: { "Next-Action": id, "Content-Type": "text/plain;charset=UTF-8", Accept: "text/x-component", Origin: BASE, Cookie: cookie },
    body: JSON.stringify([{ firstName: "Audit", lastName, phone: "", email: "", city: "", postalCode: "", address: "" }]),
  });
  return { status: response.status, location: response.headers.get("location"), raw: await response.text() };
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => { await cleanup(); });
test.afterAll(async () => { await cleanup(); });

test("un espace suspendu après coup ferme aussitôt les sessions déjà ouvertes de ses membres", async ({ page }) => {
  const userId = await createOrgAndUser(SUSPENDED_ORG, SUSPENDED_EMAIL);
  await page.goto("/login");
  await page.fill('input[type="email"]', SUSPENDED_EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard**", { timeout: 15000 });
  const cookie = cookieOf(await page.context().cookies());

  const actionId = await actionIdOf("createClientAction", "/dashboard/clients", cookie);
  expect(actionId, "action createClientAction trouvée").toBeTruthy();

  // Suspension décidée après l'ouverture de la session — elle doit couper
  // l'accès à la requête suivante, sans attendre une reconnexion.
  await sql`UPDATE "Organization" SET "suspendedAt" = now() WHERE id = ${SUSPENDED_ORG}`;

  const lastName = `${MARKER}Suspendu`;
  const result = await callCreateClient(actionId!, cookie, lastName);

  // `requireUser()` appelle redirect("/login") plutôt que de répondre avec
  // une erreur. Constaté (voir aussi attaque-elevation-secretariat.spec.ts) :
  // le serveur rend ici la page générique « introuvable » de Next.js dans
  // la réponse à l'action, sans code HTTP de redirection ni en-tête
  // Location — mais sans jamais exécuter l'écriture : c'est la base qui
  // tranche, pas le texte de la réponse.
  expect(result.raw, `réponse : ${result.status} ${result.raw.slice(0, 200)}`).toContain("could not be found");

  const [row] = await sql`SELECT id FROM "Client" WHERE "organizationId" = ${SUSPENDED_ORG} AND "lastName" = ${lastName}`;
  expect(row, "aucun client créé après la suspension").toBeUndefined();
  void userId;
});

test("une session révoquée (déconnexion, changement de mot de passe) ne vaut plus, même avec le cookie encore en main", async ({ page }) => {
  const userId = await createOrgAndUser(REVOKED_ORG, REVOKED_EMAIL);
  await page.goto("/login");
  await page.fill('input[type="email"]', REVOKED_EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard**", { timeout: 15000 });
  const cookie = cookieOf(await page.context().cookies());

  const actionId = await actionIdOf("createClientAction", "/dashboard/clients", cookie);
  expect(actionId, "action createClientAction trouvée").toBeTruthy();

  // Équivalent d'une déconnexion décidée ailleurs (autre appareil, incident,
  // ou purge d'une session ancienne) : le cookie du navigateur, lui, n'a pas
  // changé.
  await sql`UPDATE "Session" SET "revokedAt" = now() WHERE "userId" = ${userId}`;

  const lastName = `${MARKER}Revoque`;
  const result = await callCreateClient(actionId!, cookie, lastName);

  expect(result.raw, `réponse : ${result.status} ${result.raw.slice(0, 200)}`).toContain("could not be found");

  const [row] = await sql`SELECT id FROM "Client" WHERE "organizationId" = ${REVOKED_ORG} AND "lastName" = ${lastName}`;
  expect(row, "aucun client créé avec une session révoquée").toBeUndefined();
});
