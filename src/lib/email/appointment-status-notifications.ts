import "server-only";
import { prisma } from "@/lib/db";
import { getBusinessProfile } from "@/lib/business-profile-actions";
import { getEmailProvider } from "@/lib/email/provider";
import { buildIcsContent, formatBookingDateLabels } from "@/lib/booking-validation";
import {
  appointmentCancelledClientTemplate,
  appointmentConfirmedClientTemplate,
  appointmentDeclinedClientTemplate,
  appointmentRescheduledClientTemplate,
  type AppointmentEmailParams,
} from "@/lib/email/templates";
import type { EmailMessage } from "@/lib/email/provider";
import type { AppointmentMode } from "@/data/appointments";

function bookingUrl(slug: string): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${appUrl}/reserver/${slug}`;
}

export type AppointmentEmailSnapshot = {
  id: string;
  date: string;
  start: string;
  duration: number;
  mode: AppointmentMode;
  location: string;
  animalName: string;
  serviceName: string;
};

type TemplateBuilder = (params: AppointmentEmailParams) => Pick<EmailMessage, "subject" | "html" | "text">;

/**
 * Best-effort et jamais bloquant : le rendez-vous est déjà mis à jour en
 * base au moment de l'appel (par updateAppointmentStatusAction ou
 * saveAppointmentAction) — un échec d'envoi ne doit jamais remettre en
 * cause une action déjà effectuée, seulement être journalisé. Ne fait rien
 * si `clientId` est vide : un rendez-vous créé en mode "animal libre" côté
 * agenda interne n'a pas de fiche Client, donc pas d'email à qui écrire.
 */
async function sendAppointmentEmail(clientId: string | null, appointment: AppointmentEmailSnapshot, build: TemplateBuilder, attachIcs: boolean): Promise<void> {
  if (!clientId) return;

  try {
    const [client, professional] = await Promise.all([
      prisma.client.findUnique({ where: { id: clientId }, select: { email: true, firstName: true } }),
      getBusinessProfile(),
    ]);
    if (!client) return;

    const dateLabel = formatBookingDateLabels(appointment.date).fullLabel;
    const modeLabelText = appointment.mode === "cabinet" ? "Au cabinet" : "À domicile";
    const params: AppointmentEmailParams = {
      clientFirstName: client.firstName,
      animalName: appointment.animalName,
      serviceName: appointment.serviceName,
      dateLabel,
      time: appointment.start,
      modeLabel: modeLabelText,
      locationLabel: appointment.mode === "home" ? appointment.location : "",
      professionalFirstName: professional.firstName,
      professionalCompany: professional.company,
      professionalPhone: professional.phone,
      bookingUrl: bookingUrl(professional.slug),
    };

    const message = build(params);
    const attachments = attachIcs
      ? [{
          filename: "rendez-vous.ics",
          contentType: "text/calendar",
          base64Content: Buffer.from(
            buildIcsContent({
              uid: `${appointment.id}@animeo.app`,
              dateId: appointment.date,
              start: appointment.start,
              durationMinutes: appointment.duration,
              summary: `${appointment.serviceName} — ${appointment.animalName}`,
              description: `Rendez-vous avec ${professional.firstName} ${professional.lastName} (${professional.company}).`,
              location: appointment.mode === "cabinet" ? `${professional.address}, ${professional.city}` : appointment.location,
            }),
            "utf8",
          ).toString("base64"),
        }]
      : undefined;

    await getEmailProvider().send({ to: client.email, ...message, attachments });
  } catch (error) {
    console.error("[email] Échec de l'envoi d'une notification de rendez-vous", error);
  }
}

export function notifyAppointmentConfirmed(clientId: string | null, appointment: AppointmentEmailSnapshot): Promise<void> {
  return sendAppointmentEmail(clientId, appointment, appointmentConfirmedClientTemplate, true);
}

export function notifyAppointmentDeclined(clientId: string | null, appointment: AppointmentEmailSnapshot): Promise<void> {
  return sendAppointmentEmail(clientId, appointment, appointmentDeclinedClientTemplate, false);
}

export function notifyAppointmentCancelled(clientId: string | null, appointment: AppointmentEmailSnapshot): Promise<void> {
  return sendAppointmentEmail(clientId, appointment, appointmentCancelledClientTemplate, false);
}

export function notifyAppointmentRescheduled(clientId: string | null, appointment: AppointmentEmailSnapshot): Promise<void> {
  return sendAppointmentEmail(clientId, appointment, appointmentRescheduledClientTemplate, true);
}
