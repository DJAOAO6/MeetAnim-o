import "server-only";
import { dbFor, prisma, type ScopedPrismaClient } from "@/lib/db";
import { generateUpcomingTourRuns } from "@/lib/tour-run-generation";
import { sendDueAppointmentReminders } from "@/lib/scheduler/appointment-reminders";

/**
 * Relances de suivi (« revoir dans 6 mois ») arrivées à échéance : elles
 * passent de « à venir » à « dues ». Même règle que
 * l’ancienne refreshUpcomingRemindersAction, sans revalidatePath — il n’y a pas de
 * page à rafraîchir hors d'une requête.
 */
async function markDueFollowUps(db: ScopedPrismaClient, now: Date): Promise<number> {
  const reference = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  const result = await db.reminder.updateMany({ where: { status: "UPCOMING", dueDate: { lte: reference } }, data: { status: "DUE" } });
  return result.count;
}

/**
 * Les tâches de fond, indépendantes : l'échec de l'une n'empêche jamais les
 * autres. Toutes sont idempotentes — les rejouer ne crée ni doublon ni
 * second envoi —, ce qui permet de les lancer chaque heure sans compter.
 *
 * Elles tournent sans personne de connecté : chaque cabinet est donc traité
 * l'un après l'autre, avec son propre accès cloisonné. Un cabinet en erreur
 * n'empêche pas les suivants d'être traités — sans quoi un réglage bancal
 * chez l'un priverait tous les autres de leurs rappels.
 */
export async function runScheduledJobs(now: Date = new Date()) {
  const organizations = await prisma.organization.findMany({ select: { id: true, name: true } });
  const errors: string[] = [];
  let followUpsDue = 0;
  let tourRunsGenerated = 0;
  let appointmentReminders: Awaited<ReturnType<typeof sendDueAppointmentReminders>> | null = null;

  for (const organization of organizations) {
    const db = dbFor(organization.id);
    const [followUps, tourRuns, reminders] = await Promise.allSettled([
      markDueFollowUps(db, now),
      generateUpcomingTourRuns(db, organization.id),
      sendDueAppointmentReminders(db, now),
    ]);

    for (const result of [followUps, tourRuns, reminders]) {
      if (result.status === "rejected") errors.push(`${organization.name} : ${String(result.reason)}`);
    }
    if (followUps.status === "fulfilled") followUpsDue += followUps.value;
    if (tourRuns.status === "fulfilled") tourRunsGenerated += tourRuns.value.created;
    if (reminders.status === "fulfilled") {
      // Cumul sur l'ensemble des cabinets ; « activé » vaut pour au moins un.
      appointmentReminders = appointmentReminders
        ? {
          enabled: appointmentReminders.enabled || reminders.value.enabled,
          sent: appointmentReminders.sent + reminders.value.sent,
          failed: appointmentReminders.failed + reminders.value.failed,
          withoutEmail: appointmentReminders.withoutEmail + reminders.value.withoutEmail,
        }
        : reminders.value;
    }
  }

  return {
    ok: errors.length === 0,
    organizations: organizations.length,
    followUpsDue,
    tourRunsGenerated,
    appointmentReminders,
    errors,
  };
}
