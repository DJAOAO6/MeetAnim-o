import "server-only";
import { organizationIdOf, type ScopedPrismaClient } from "@/lib/db";
import { businessProfileOf } from "@/lib/business-profile-actions";
import { logAudit } from "@/lib/audit";
import { getEmailProvider, professionalReplyTo } from "@/lib/email/provider";
import { requestExpiredClientTemplate, requestExpiredProfessionalTemplate } from "@/lib/email/templates";
import { formatBookingDateLabels } from "@/lib/booking-validation";
import { requestExpiresAt } from "@/lib/slot-requests";

export type ExpiredRequestsResult = { expired: number; failed: number };

/**
 * Demandes à plusieurs horaires restées sans réponse (chantier C8) : passé
 * l'échéance — 72 h, ou 24 h avant le premier horaire proposé —, la demande
 * est annulée et ses horaires se libèrent. Le client est prévenu (il peut
 * refaire une demande), le professionnel aussi.
 *
 * Chaque demande à part : un échec n'arrête pas les autres. L'annulation est
 * conditionnelle (encore en attente) : deux passages ne préviennent qu'une
 * fois.
 */
export async function expireUnansweredRequests(db: ScopedPrismaClient, now: Date = new Date()): Promise<ExpiredRequestsResult> {
  const result: ExpiredRequestsResult = { expired: 0, failed: 0 };
  const requests = await db.appointment.findMany({
    where: { status: "PENDING", slotOptions: { some: {} } },
    select: { id: true, createdAt: true, clientId: true, clientName: true, animalName: true, slotOptions: { orderBy: { rank: "asc" }, select: { date: true, start: true } } },
  });

  for (const request of requests) {
    const slots = request.slotOptions.map((option) => ({ date: option.date.toISOString().slice(0, 10), start: option.start }));
    if (requestExpiresAt({ createdAt: request.createdAt, slots }).getTime() > now.getTime()) continue;
    try {
      const cancelled = await db.$transaction(async (tx) => {
        const { count } = await tx.appointment.updateMany({ where: { id: request.id, status: "PENDING" }, data: { status: "CANCELLED" } });
        if (count > 0) await tx.appointmentSlotOption.deleteMany({ where: { appointmentId: request.id } });
        return count > 0;
      });
      if (!cancelled) continue;
      result.expired += 1;
      await logAudit({ userId: null, impersonatorId: null, organizationId: organizationIdOf(db), action: "APPOINTMENT_STATUS_CHANGED", entityType: "Appointment", entityId: request.id, metadata: { status: "cancelled", expired: true, automatic: true } });
      await notifyExpiry(db, request, slots);
    } catch (error) {
      result.failed += 1;
      console.error("[expiration des demandes] demande non traitée", { appointmentId: request.id, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return result;
}

/** Les deux e-mails, en best-effort : un échec d'envoi ne rétablit pas la demande. */
async function notifyExpiry(db: ScopedPrismaClient, request: { clientId: string | null; clientName: string; animalName: string }, slots: Array<{ date: string; start: string }>): Promise<void> {
  try {
    const [professional, client] = await Promise.all([
      businessProfileOf(db),
      request.clientId ? db.client.findUnique({ where: { id: request.clientId }, select: { email: true, firstName: true } }) : null,
    ]);
    const bookingUrl = `${(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "")}/reserver/${professional.slug}`;
    const slotLabels = slots.map((slot) => `${formatBookingDateLabels(slot.date).fullLabel} à ${slot.start}`);
    await Promise.allSettled([
      client?.email.trim()
        ? getEmailProvider().send({
            to: client.email,
            ...requestExpiredClientTemplate({ clientFirstName: client.firstName || request.clientName, animalName: request.animalName, professionalFirstName: professional.firstName, professionalCompany: professional.company, professionalPhone: professional.phone, bookingUrl }),
            replyTo: professionalReplyTo(professional),
          })
        : Promise.resolve(),
      professional.email.trim()
        ? getEmailProvider().send({ to: professional.email, ...requestExpiredProfessionalTemplate({ professionalFirstName: professional.firstName, clientName: request.clientName, animalName: request.animalName, slotLabels }) })
        : Promise.resolve(),
    ]);
  } catch (error) {
    console.error("[expiration des demandes] e-mails non envoyés", error instanceof Error ? error.message : String(error));
  }
}
