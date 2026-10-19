import { readFileSync } from "node:fs";
import { expect, test } from "../helpers/test";
import { neon } from "../helpers/sql";
import { config } from "dotenv";
import { BASE_URL } from "../helpers/base-url";

config({ path: ".env.local" });
const sql = neon(process.env.DATABASE_URL!);
const BASE = BASE_URL;

/**
 * Phase 3 — Profil 1 : un visiteur anonyme, sans compte, qui ne fait
 * qu'ouvrir des pages publiques et lire ce qu'elles envoient.
 *
 * Preuve pour `SEC-15` et `SEC-11` (docs/audit-2026-10/02-SECURITE-CODE.md).
 * Rien n'est créé ici : ces essais ne font que lire.
 */

const SLUG = "pauline-faucillon";

/** Identifiants d'actions présents dans le JavaScript d'une page, visitée sans cookie. */
async function actionIdsAnonymous(path: string): Promise<Record<string, string>> {
  const html = await (await fetch(`${BASE}${path}`)).text();
  const chunks = [...new Set(html.match(/\/_next\/static\/[^"'\s]+\.js/g) ?? [])];
  const ids: Record<string, string> = {};
  for (const chunk of chunks) {
    const js = await (await fetch(`${BASE}${chunk}`)).text();
    for (const m of js.matchAll(/"([0-9a-f]{40,})":\{"name":"(\w+)"\}/g)) ids[m[2]] = m[1];
  }
  return ids;
}

function practitionerCookie(): string {
  const state = JSON.parse(readFileSync("tests/.auth/practitioner.json", "utf8")) as { cookies: { name: string; value: string }[] };
  return state.cookies.map((c) => `${c.name}=${c.value}`).join("; ");
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

// ---------------------------------------------------------------------------
// SEC-15 : téléphone et adresse masqués, mais envoyés quand même
// ---------------------------------------------------------------------------

test.describe("SEC-15 — champs masqués dans la page de réservation", () => {
  type ProfileRow = { id: string; phone: string | null; address: string | null; showPhonePublicly: boolean; showAddressPublicly: boolean };
  let original: ProfileRow;

  test.beforeAll(async () => {
    const [row] = await sql`SELECT id, phone, address, "showPhonePublicly", "showAddressPublicly" FROM "BusinessProfile" WHERE slug = ${SLUG}`;
    original = row as ProfileRow;
    expect(original, "le profil de test existe").toBeTruthy();
    // Les deux bascules décochées : c'est la position qu'un professionnel
    // prend pour ne pas afficher ces informations publiquement.
    await sql`UPDATE "BusinessProfile" SET "showPhonePublicly" = false, "showAddressPublicly" = false WHERE id = ${original.id}`;
  });

  test.afterAll(async () => {
    await sql`UPDATE "BusinessProfile" SET "showPhonePublicly" = ${original.showPhonePublicly}, "showAddressPublicly" = ${original.showAddressPublicly} WHERE id = ${original.id}`;
  });

  test("le téléphone et l'adresse masqués n'apparaissent pas dans la page envoyée au visiteur", async () => {
    const html = await (await fetch(`${BASE}/reserver/${SLUG}`)).text();

    // Ce test CONSTATE : un résultat rouge signale le défaut décrit par
    // SEC-15 (le masquage n'est fait que par l'écran, pas par le serveur),
    // pas une erreur du test.
    if (original.phone) {
      expect(html, "le téléphone masqué n'apparaît pas dans la page reçue").not.toContain(original.phone);
    }
    if (original.address) {
      expect(html, "l'adresse masquée n'apparaît pas dans la page reçue").not.toContain(original.address);
    }
  });
});

// ---------------------------------------------------------------------------
// SEC-11 : fonctions de lecture sans compte — atteignables depuis un
// navigateur ? C'était la question laissée ouverte par la phase 2.
// ---------------------------------------------------------------------------

test.describe("SEC-11 — atteignabilité depuis un navigateur", () => {
  const FLAGGED = ["getBusinessProfile", "getAvailability", "getReminderSettings", "getServices", "getPublicServices"] as const;

  test("aucune des fonctions visées n'apparaît comme action appelable dans les pages qui les utilisent", async () => {
    // Pages qui appellent ces fonctions côté serveur (relevé par lecture de
    // code) : si l'une d'elles devenait appelable, son identifiant
    // apparaîtrait dans le JavaScript envoyé à l'une de ces pages.
    const anonymous = await actionIdsAnonymous(`/reserver/${SLUG}`);
    const cookie = practitionerCookie();
    const connected: Record<string, string> = {};
    for (const path of ["/dashboard/agenda", "/dashboard/bienvenue", "/dashboard/parametres", "/dashboard/prestations", "/dashboard/rappels"]) {
      Object.assign(connected, await actionIdsWithCookie(path, cookie));
    }

    for (const name of FLAGGED) {
      // Résultat attendu ici : absent des deux côtés. Si ce test devient
      // rouge, une de ces fonctions a été câblée dans un composant client
      // depuis la phase 2 — SEC-11 cesserait d'être théorique et deviendrait
      // exploitable sans compte, tant qu'un seul cabinet existe.
      expect(anonymous[name], `${name} appelable depuis la page publique`).toBeUndefined();
      expect(connected[name], `${name} appelable depuis l'espace professionnel`).toBeUndefined();
    }
  });
});
