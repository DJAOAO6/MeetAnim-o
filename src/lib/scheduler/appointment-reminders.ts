import "server-only";
import type { ScopedPrismaClient } from "@/lib/db";
import { reminderSettingsOf } from "@/lib/business-profile-actions";
import { sendAppointmentReminder, type AppointmentEmailSnapshot } from "@/lib/email/appointment-status-notifications";
import { parisDateId, parisWallTimeToDate } from "@/lib/paris-time";

export type AppointmentRemindersResult = { enabled: boolean; sent: number; failed: number; withoutEmail: number };

/**
 * Envoie le rappel des rendez-vous qui approchent.
 *
 * Réglé dans Paramètres › Rappels (activé par défaut, 24 ou 48 heures
 * avant). La fenêtre de rendez-vous annonçait déjà « un rappel est envoyé
 * automatiquement » — sans que rien ne l'envoie. C'est ce qui le fait.
 *
 * Appelée chaque heure par le planificateur : un rendez-vous reçoit son
 * rappel dans l'heure qui suit l'entrée dans la fenêtre. Seuls les
 * rendez-vous confirmés sont rappelés — une demande pas encore acceptée ne
 * doit pas être présentée au client comme un rendez-vous acquis.
 *
 * Sans session : le cabinet est passé en argument par le planificateur, qui
 * les parcourt tous — chacun a ses propres réglages.
 *
 * Jamais deux fois : chaque rendez-vous est « réservé » en base
 * (reminderSentAt) avant l'envoi, par une écriture conditionnelle. Si l'envoi
 * échoue, la réservation est levée et le passage suivant réessaie ; s'il n'y
 * a pas d'adresse, elle est gardée, inutile de réessayer chaque heure.
 */
export async function sendDueAppointmentReminders(db: ScopedPrismaClient, now: Date = new Date()): Promise<AppointmentRemindersResult> {
  const settings = await reminderSettingsOf(db);
  const result: AppointmentRemindersResult = { enabled: settings.appointmentReminderEnabled, sent: 0, failed: 0, withoutEmail: 0 };
  if (!settings.appointmentReminderEnabled) return result;

  const windowMs = (settings.appointmentReminderDelay === "48 heures avant" ? 48 : 24) * 60 * 60 * 1000;

  // Aujourd'hui + 3 jours couvre largement 48 h, quelle que soit l'heure.
  const candidates = await db.appointment.findMany({
    where: {
      status: "CONFIRMED",
      reminderSentAt: null,
      clientId: { not: null },
      date: { gte: new Date(`${parisDateId(now)}T00:00:00.000Z`), lte: new Date(`${parisDateId(now, 3)}T00:00:00.000Z`) },
    },
    select: { id: true, date: true, start: true, duration: true, mode: true, location: true, animalName: true, serviceName: true, clientId: true },
  });

  for (const appointment of candidates) {
    const dateId = appointment.date.toISOString().slice(0, 10);
    const startsIn = parisWallTimeToDate(dateId, appointment.start).getTime() - now.getTime();
    if (startsIn <= 0 || startsIn > windowMs) continue;

    const claimed = await db.appointment.updateMany({ where: { id: appointment.id, reminderSentAt: null }, data: { reminderSentAt: now } });
    if (claimed.count === 0) continue;

    const snapshot: AppointmentEmailSnapshot = {
      id: appointment.id,
      date: dateId,
      start: appointment.start,
      duration: appointment.duration,
      mode: appointment.mode === "CABINET" ? "cabinet" : "home",
      location: appointment.location,
      animalName: appointment.animalName,
      serviceName: appointment.serviceName,
    };
    const outcome = await sendAppointmentReminder(db, appointment.clientId, snapshot);
    if (outcome === "sent") result.sent += 1;
    else if (outcome === "no-recipient") result.withoutEmail += 1;
    else {
      result.failed += 1;
      await db.appointment.update({ where: { id: appointment.id }, data: { reminderSentAt: null } });
    }
  }

  return result;
}
