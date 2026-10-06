import "server-only";
import { organizationIdOf, type ScopedPrismaClient } from "@/lib/db";
import { reminderSettingsOf } from "@/lib/business-profile-actions";
import { markAppointmentCompleted } from "@/lib/appointment-completion";
import { logAudit } from "@/lib/audit";
import { parisDateId } from "@/lib/paris-time";
import { shouldAutoComplete } from "@/lib/auto-complete";
import type { Prisma } from "@/generated/prisma/client";

export type AutoCompleteResult = { enabled: boolean; completed: number; failed: number };

/**
 * Les rendez-vous confirmés dont l'heure de fin est passée deviennent
 * « réalisés », consultation comprise — comme le bouton, sans le rappel
 * suggéré, qui reste une décision humaine. Réglable dans Paramètres
 * (activé par défaut).
 *
 * Seulement ceux terminés après la mise en service : le premier passage
 * note sa date et ne touche à rien d'ancien. Chaque rendez-vous est traité
 * à part (un échec n'arrête pas les autres), et une seconde réalisation
 * n'est jamais possible (markAppointmentCompleted).
 */
export async function completePastAppointments(db: ScopedPrismaClient, now: Date = new Date()): Promise<AutoCompleteResult> {
  const settings = await reminderSettingsOf(db);
  const result: AutoCompleteResult = { enabled: settings.autoCompleteAppointments, completed: 0, failed: 0 };
  if (!settings.autoCompleteAppointments) return result;

  // Premier passage : on note la mise en service, rien d'antérieur n'est touché.
  if (!settings.autoCompleteSince) {
    const profile = await db.businessProfile.findFirst({ select: { id: true } });
    if (profile) await db.businessProfile.update({ where: { id: profile.id }, data: { reminderSettings: { ...settings, autoCompleteSince: now.toISOString() } as unknown as Prisma.InputJsonValue } });
    return result;
  }
  const since = new Date(settings.autoCompleteSince);

  // Du jour de la mise en service (veille comprise, pour un rendez-vous fini après minuit) à aujourd'hui.
  const candidates = await db.appointment.findMany({
    where: {
      status: "CONFIRMED",
      date: { gte: new Date(`${parisDateId(since, -1)}T00:00:00.000Z`), lte: new Date(`${parisDateId(now)}T00:00:00.000Z`) },
    },
    select: { id: true, date: true, start: true, duration: true },
  });

  const organizationId = organizationIdOf(db);
  for (const appointment of candidates) {
    if (!shouldAutoComplete({ date: appointment.date.toISOString().slice(0, 10), start: appointment.start, duration: appointment.duration }, since, now)) continue;
    try {
      if (await markAppointmentCompleted(db, appointment.id, { completedAt: now, automatic: true })) {
        result.completed += 1;
        await logAudit({ userId: null, impersonatorId: null, organizationId, action: "APPOINTMENT_STATUS_CHANGED", entityType: "Appointment", entityId: appointment.id, metadata: { status: "completed", automatic: true } });
      }
    } catch (error) {
      result.failed += 1;
      console.error("[réalisation automatique] rendez-vous non traité", { appointmentId: appointment.id, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return result;
}
