import "server-only";
import { prisma } from "@/lib/db";
import { generateUpcomingTourRuns } from "@/lib/tour-run-generation";
import { sendDueAppointmentReminders } from "@/lib/scheduler/appointment-reminders";

/**
 * Relances de suivi (« revoir dans 6 mois ») arrivées à échéance : elles
 * passent de « à venir » à « dues ». Même règle que
 * l’ancienne refreshUpcomingRemindersAction, sans revalidatePath — il n’y a pas de
 * page à rafraîchir hors d'une requête.
 */
async function markDueFollowUps(now: Date): Promise<number> {
  const reference = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  const result = await prisma.reminder.updateMany({ where: { status: "UPCOMING", dueDate: { lte: reference } }, data: { status: "DUE" } });
  return result.count;
}

/**
 * Les tâches de fond, indépendantes : l'échec de l'une n'empêche jamais les
 * autres. Toutes sont idempotentes — les rejouer ne crée ni doublon ni
 * second envoi —, ce qui permet de les lancer chaque heure sans compter.
 */
export async function runScheduledJobs(now: Date = new Date()) {
  const [followUps, tourRuns, appointmentReminders] = await Promise.allSettled([
    markDueFollowUps(now),
    generateUpcomingTourRuns(),
    sendDueAppointmentReminders(now),
  ]);
  const errors = [followUps, tourRuns, appointmentReminders]
    .filter((result): result is PromiseRejectedResult => result.status === "rejected")
    .map((result) => String(result.reason));
  return {
    ok: errors.length === 0,
    followUpsDue: followUps.status === "fulfilled" ? followUps.value : null,
    tourRunsGenerated: tourRuns.status === "fulfilled" ? tourRuns.value.created : null,
    appointmentReminders: appointmentReminders.status === "fulfilled" ? appointmentReminders.value : null,
    errors,
  };
}
