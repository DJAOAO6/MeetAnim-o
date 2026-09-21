import "server-only";
import { runScheduledJobs } from "@/lib/scheduler/jobs";

const HOUR_MS = 60 * 60 * 1000;
/** Premier passage peu après le démarrage, une fois le serveur installé. */
const FIRST_RUN_DELAY_MS = 2 * 60 * 1000;

let started = false;
let running = false;

/**
 * Planificateur interne, démarré une fois par src/instrumentation.ts.
 *
 * La route /api/cron/daily était conçue pour les crons de Vercel ; en
 * production sur Iridflow, rien ne l'appelait, et aucune tâche de fond ne
 * tournait. Plutôt qu'un service externe de plus, le serveur se charge
 * lui-même de ses tâches, chaque heure.
 *
 * Un passage ne chevauche jamais le précédent (drapeau `running`). Deux
 * conteneurs brièvement actifs pendant un déploiement ne posent pas de
 * problème : chaque tâche est idempotente, et chaque rappel est réservé en
 * base avant d'être envoyé.
 */
export function startScheduler() {
  if (started) return;
  started = true;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const summary = await runScheduledJobs();
      if (!summary.ok || (summary.appointmentReminders && summary.appointmentReminders.sent + summary.appointmentReminders.failed > 0)) {
        console.info("[planificateur]", JSON.stringify(summary));
      }
    } catch (error) {
      console.error("[planificateur] passage en échec", error);
    } finally {
      running = false;
    }
  };

  setTimeout(tick, FIRST_RUN_DELAY_MS);
  setInterval(tick, HOUR_MS);
  console.info("[planificateur] démarré : tâches de fond chaque heure");
}
