import { expect, test } from "../helpers/test";
import { config } from "dotenv";
import { BASE_URL } from "../helpers/base-url";

config({ path: ".env.local" });
const secret = process.env.CRON_SECRET;

/**
 * Chantier 15 des correctifs de l'audit 2026-10 — route de surveillance
 * (EXP-02, src/app/api/health/route.ts).
 */

test("EXP-02 — sans secret, la route de santé ne dit que « ok » ou non", async () => {
  const response = await fetch(`${BASE_URL}/api/health`);
  expect([200, 503]).toContain(response.status);
  const body = await response.json() as Record<string, unknown>;
  expect(Object.keys(body), "aucun détail interne pour un inconnu").toEqual(["ok"]);
  expect(body.ok).toBe(response.status === 200);
});

test("EXP-02 — avec le secret, le détail de chaque contrôle", async () => {
  test.skip(!secret, "CRON_SECRET absent : lancer le serveur de test avec le même secret");
  const response = await fetch(`${BASE_URL}/api/health`, { headers: { Authorization: `Bearer ${secret}` } });
  const body = await response.json() as { ok: boolean; checks: Array<{ key: string; ok: boolean }> };
  const keys = body.checks.map((check) => check.key);
  for (const key of ["database", "barrier", "email", "session-secret"]) expect(keys).toContain(key);
  // Base de test : joignable, et sous un compte qui ne contourne pas le cloisonnement.
  expect(body.checks.find((check) => check.key === "database")?.ok).toBe(true);
  expect(body.checks.find((check) => check.key === "barrier")?.ok).toBe(true);
});
