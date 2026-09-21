/**
 * Appelé une fois au démarrage du serveur Next.js.
 *
 * Démarre le planificateur des tâches de fond (rappels de rendez-vous,
 * relances dues, journées de tournée) — voir src/lib/scheduler/start.ts.
 *
 * En production seulement, par défaut : la base de développement contient
 * des données réalistes, et un serveur de développement ne doit jamais
 * envoyer de rappel à un vrai client. SCHEDULER_ENABLED=1 ou 0 force le
 * choix dans un sens ou dans l'autre.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const override = process.env.SCHEDULER_ENABLED;
  const enabled = override === undefined ? process.env.NODE_ENV === "production" : override === "1";
  if (!enabled) return;

  const { startScheduler } = await import("@/lib/scheduler/start");
  startScheduler();
}
