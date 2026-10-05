import "server-only";
import { purgeExpiredSecurityRecords } from "@/lib/rate-limit";
import { redactEmails } from "@/lib/privacy";
import { dbFor, prisma, type ScopedPrismaClient } from "@/lib/db";
import { OPEN_ORGANIZATION_WHERE } from "@/lib/organization-status";
import { hasModule } from "@/lib/modules";
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
export async function runScheduledJobs(now: Date = new Date(), options: { organizationId?: string } = {}) {
  // Traces de sécurité expirées (tentatives de connexion, codes) : purgées à
  // chaque passage, quel que soit l'espace. Une panne ici n'arrête pas le reste.
  const securityPurge = await purgeExpiredSecurityRecords().then(() => true, () => false);

  // Espaces ouverts seulement : un espace suspendu n'envoie plus rien à ses
  // clients — ni rappel, ni relance — et ne génère plus de tournée.
  const organizations = await prisma.organization.findMany({
    where: { ...OPEN_ORGANIZATION_WHERE, ...(options.organizationId ? { id: options.organizationId } : {}) },
    select: { id: true, modules: true },
  });
  const errors: string[] = [];
  let followUpsDue = 0;
  let tourRunsGenerated = 0;
  let appointmentReminders: Awaited<ReturnType<typeof sendDueAppointmentReminders>> | null = null;

  for (const organization of organizations) {
    const db = dbFor(organization.id);
    // Les relances et les journées de tournée n'ont lieu que si l'espace a
    // le module ; le rappel de rendez-vous fait partie du socle.
    const [followUps, tourRuns, reminders] = await Promise.allSettled([
      hasModule(organization.modules, "REMINDERS") ? markDueFollowUps(db, now) : Promise.resolve(0),
      hasModule(organization.modules, "TOURS") ? generateUpcomingTourRuns(db, organization.id) : Promise.resolve({ created: 0 }),
      sendDueAppointmentReminders(db, now),
    ]);

    for (const result of [followUps, tourRuns, reminders]) {
      if (result.status === "rejected") errors.push(`${organization.id} : ${redactEmails(String(result.reason))}`);
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
    ok: errors.length === 0 && securityPurge,
    organizations: organizations.length,
    followUpsDue,
    tourRunsGenerated,
    appointmentReminders,
    errors,
  };
}
