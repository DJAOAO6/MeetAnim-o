import { NextResponse, type NextRequest } from "next/server";
import { runScheduledJobs } from "@/lib/scheduler/jobs";

/**
 * Prérequis technique de toutes les tâches de fond (rappel J-1, purges…) —
 * AUDIT-PRODUIT-2026-08-30.md, finding P0 §5 : jusqu'ici, rien dans le
 * projet ne pouvait s'exécuter sans qu'un navigateur soit ouvert
 * (DashboardRealtimeRefresh n'est qu'un router.refresh() toutes les 60 s
 * sur un écran déjà ouvert, ça ne peut pas déclencher un envoi à 8 h du
 * matin). Déclenchée par vercel.json (crons), protégée par un secret
 * d'en-tête pour empêcher n'importe qui de la lancer à volonté.
 *
 * Chaque tâche est indépendante (Promise.allSettled) : l'échec de l'une ne
 * doit jamais empêcher les autres de s'exécuter — piège identifié dans
 * l'audit pour un futur envoi de rappels en boucle.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Mêmes tâches que le planificateur interne (src/lib/scheduler/start.ts),
  // qui les lance déjà chaque heure en production : cette route reste pour
  // un déclenchement manuel ou externe, protégé par CRON_SECRET.
  return NextResponse.json(await runScheduledJobs());
}
