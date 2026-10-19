import { readFileSync } from "node:fs";
import { expect, test } from "../helpers/test";
import { neon } from "../helpers/sql";
import { config } from "dotenv";
import { BASE_URL } from "../helpers/base-url";
import { loginAsSecretary, secretaryEmail } from "../helpers/secretary-login";

config({ path: ".env.local" });
const sql = neon(process.env.DATABASE_URL!);
const BASE = BASE_URL;
const EMAIL = "praticien-test@pf-osteo-animale.fr";

/**
 * Phase 3 — Profil 4 : le compte Secrétariat (role: SECRETARY, aucune
 * permission), qui tente de s'élever lui-même au rôle administrateur en
 * appelant directement l'action du serveur, sans passer par l'écran
 * d'administration (que tests/secretary-role-separation.spec.ts montre déjà
 * fermé côté page — ceci vérifie la garde de l'action elle-même, atteignable
 * indépendamment de toute page).
 *
 * Preuve pour la garde `requireAdmin` de `setUserRole`
 * (src/lib/admin/actions.ts) — complète la partie F de
 * docs/audit-2026-10/02-SECURITE-CODE.md.
 */

function cookieOf(cookies: { name: string; value: string }[]): string {
  return cookies.map((c) => `${c.name}=${c.value}`).join("; ");
}

function practitionerCookie(): string {
  const state = JSON.parse(readFileSync("tests/.auth/practitioner.json", "utf8")) as { cookies: { name: string; value: string }[] };
  return cookieOf(state.cookies);
}

async function actionIdsWithCookie(path: string, cookie: string): Promise<Record<string, string>> {
  const html = await (await fetch(`${BASE}${path}`, { headers: { Cookie: cookie } })).text();
  const chunks = [...new Set(html.match(/\/_next\/static\/[^"'\s]+\.js/g) ?? [])];
  const ids: Record<string, string> = {};
  for (const chunk of chunks) {
    const js = await (await fetch(`${BASE}${chunk}`)).text();
    for (const m of js.matchAll(/"([0-9a-f]{40,})":\{"name":"(\w+)"\}/g)) ids[m[2]] = m[1];
  }
  return ids;
}

async function callAction(id: string, args: unknown[], path: string, cookie: string) {
  const response = await fetch(`${BASE}${path}`, {
    method: "POST",
    redirect: "manual",
    headers: { "Next-Action": id, "Content-Type": "text/plain;charset=UTF-8", Accept: "text/x-component", Origin: BASE, Cookie: cookie },
    body: JSON.stringify(args),
  });
  const raw = await response.text();
  return { status: response.status, location: response.headers.get("location"), raw };
}

test.describe.configure({ mode: "serial" });

let teamActions: Record<string, string> = {};
let originalRole = "PRACTITIONER";
let selfId = "";

test.beforeAll(async () => {
  // Le compte de test reçoit le rôle administrateur le temps de récupérer
  // l'identifiant de l'action depuis la page qui s'en sert — sans quoi la
  // page elle-même redirigerait avant de livrer son JavaScript, et
  // l'identifiant ne serait jamais recueilli. C'est le même moyen que
  // tests/organization-isolation-actions.spec.ts.
  const [self] = await sql`SELECT id, role FROM "User" WHERE email = ${EMAIL}`;
  selfId = self.id as string;
  originalRole = self.role as string;
  await sql`UPDATE "User" SET role = 'ADMIN' WHERE id = ${selfId}`;
  teamActions = await actionIdsWithCookie("/dashboard/admin", practitionerCookie());
});

test.afterAll(async () => {
  await sql`UPDATE "User" SET role = ${originalRole}::"UserRole" WHERE id = ${selfId}`;
});

test("témoin : un administrateur peut bien changer un rôle dans son équipe", async () => {
  expect(teamActions.setUserRole, "action setUserRole trouvée").toBeTruthy();
  const [secretary] = await sql`SELECT id, role FROM "User" WHERE email = ${secretaryEmail}`;
  const before = secretary.role as string;
  await callAction(teamActions.setUserRole, [secretary.id, "PRACTITIONER"], "/dashboard/admin", practitionerCookie());
  const [after] = await sql`SELECT role FROM "User" WHERE id = ${secretary.id}`;
  expect(after.role, "sinon, le refus ci-dessous ne prouverait rien").toBe("PRACTITIONER");
  await sql`UPDATE "User" SET role = ${before}::"UserRole" WHERE id = ${secretary.id}`;
});

test("le secrétariat ne peut pas s'élever lui-même au rôle administrateur", async ({ page }) => {
  await loginAsSecretary(page);
  const cookie = cookieOf(await page.context().cookies());
  const [secretary] = await sql`SELECT id, role FROM "User" WHERE email = ${secretaryEmail}`;
  expect(secretary.role, "le compte part bien du rôle Secrétariat").toBe("SECRETARY");

  const result = await callAction(teamActions.setUserRole, [secretary.id, "ADMIN"], "/dashboard/admin", cookie);

  const [after] = await sql`SELECT role FROM "User" WHERE id = ${secretary.id}`;
  expect(after.role, `le rôle n'a pas changé (réponse : ${result.status} ${result.raw.slice(0, 200)})`).toBe("SECRETARY");
  // requireAdmin() appelle redirect("/dashboard") plutôt que de répondre
  // avec une erreur. Constaté : à la différence d'un refus par permission
  // (message dans le flux), le serveur rend ici la page générique
  // « introuvable » de Next.js dans la réponse à l'action — pas de code
  // HTTP de redirection ni d'en-tête Location — mais sans jamais exécuter
  // la mise à jour : c'est la base qui tranche, pas le texte de la réponse.
  expect(result.raw, "la page « introuvable » remplace le résultat de l'action détournée").toContain("could not be found");
});
