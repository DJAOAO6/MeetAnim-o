import { NextResponse, type NextRequest } from "next/server";
import { refreshUpcomingRemindersAction } from "@/lib/reminders-actions";
import { generateUpcomingTourRuns } from "@/lib/tour-run-generation";

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

  const results = await Promise.allSettled([refreshUpcomingRemindersAction(), generateUpcomingTourRuns()]);

  const [remindersResult, tourRunsResult] = results;
  const summary = {
    remindersRefreshed: remindersResult.status === "fulfilled" ? remindersResult.value.updated : null,
    tourRunsGenerated: tourRunsResult.status === "fulfilled" ? tourRunsResult.value.created : null,
    errors: results.filter((result) => result.status === "rejected").map((result) => String((result as PromiseRejectedResult).reason)),
  };

  return NextResponse.json({ ok: summary.errors.length === 0, ...summary });
}
