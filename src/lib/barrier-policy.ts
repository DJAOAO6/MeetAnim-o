/**
 * Que faire quand la seconde barrière (cloisonnement dans la base) est
 * inactive au démarrage (audit 2026-10, SEC-08) : en production, refuser de
 * démarrer, sauf issue de secours explicite ; ailleurs, prévenir.
 */
export function inactiveBarrierAction(env: { NODE_ENV?: string; ALLOW_INACTIVE_DB_BARRIER?: string }): "stop" | "warn" {
  return env.NODE_ENV === "production" && env.ALLOW_INACTIVE_DB_BARRIER !== "1" ? "stop" : "warn";
}
