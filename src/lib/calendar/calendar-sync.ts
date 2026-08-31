import "server-only";
import { prisma } from "@/lib/db";
import { getActiveConnectionsForProvider, getFreshAccessToken, providerFor } from "@/lib/calendar/calendar-connections";
import type { CalendarEventInput } from "@/lib/calendar/types";
import type { Appointment as DbAppointment, CalendarConnection as DbCalendarConnection, Client as DbClient } from "@/generated/prisma/client";

/**
 * Diffuse un rendez-vous interne vers les calendriers externes connectés —
 * jamais l'inverse (voir CalendarProvider, types.ts) : le logiciel reste la
 * source de vérité, un échec Google ne remet jamais en cause le rendez-vous
 * déjà enregistré en base. Appelée après coup (next/server `after()`, voir
 * appointments-actions.ts), jamais dans le chemin critique de la réponse
 * utilisateur.
 */

type AppointmentWithClient = DbAppointment & { client: DbClient | null };

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

/**
 * Date/heure "flottantes" (sans décalage), timeZone IANA séparée — même
 * convention que buildIcsContent (booking-validation.ts) : Google interprète
 * lui-même l'heure locale via le champ timeZone, pas besoin de calculer le
 * décalage UTC (été/hiver) nous-mêmes.
 */
function toFloatingIso(date: Date, time: string): string {
  const dateId = date.toISOString().slice(0, 10);
  return `${dateId}T${time}:00`;
}

function endDateAndTime(startDate: Date, startTime: string, durationMinutes: number): { date: Date; time: string } {
  const [hours, minutes] = startTime.split(":").map(Number);
  const local = new Date(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate(), hours, minutes + durationMinutes);
  return { date: local, time: `${String(local.getHours()).padStart(2, "0")}:${String(local.getMinutes()).padStart(2, "0")}` };
}

/**
 * Construit un événement utile au professionnel à partir des seules données
 * réellement disponibles — jamais d'information inventée ni sensible
 * inutile (motif de consultation, notes internes volontairement absents).
 */
function buildEventContent(appointment: AppointmentWithClient): CalendarEventInput {
  const startIso = toFloatingIso(appointment.date, appointment.start);
  const end = endDateAndTime(appointment.date, appointment.start, appointment.duration);
  const endIso = toFloatingIso(end.date, end.time);

  const lines = [
    `Client : ${appointment.clientName}`,
    `Animal : ${appointment.animalName}`,
    appointment.animalSpecies ? `Type : ${appointment.animalSpecies}` : null,
    appointment.client?.phone ? `Téléphone : ${appointment.client.phone}` : null,
    appointment.client?.email ? `E-mail : ${appointment.client.email}` : null,
    `Prestation : ${appointment.serviceName}`,
    `Mode : ${appointment.mode === "DOMICILE" ? "À domicile" : "Au cabinet"}`,
    "",
    "Rendez-vous créé depuis Animéo",
    "",
    "Voir le rendez-vous :",
    `${appUrl()}/dashboard/agenda`,
  ].filter((line): line is string => line !== null);

  return {
    summary: `${appointment.serviceName} — ${appointment.animalName}`,
    description: lines.join("\n"),
    location: appointment.mode === "DOMICILE" ? appointment.location : "Cabinet",
    startIso,
    endIso,
    timeZone: "Europe/Paris",
  };
}

type SyncAction = "upsert" | "cancel";

async function syncOneConnection(connection: DbCalendarConnection, appointment: AppointmentWithClient, action: SyncAction): Promise<void> {
  const provider = providerFor(connection.provider);
  const existingLink = await prisma.appointmentCalendarEvent.findUnique({
    where: { appointmentId_connectionId: { appointmentId: appointment.id, connectionId: connection.id } },
  });

  try {
    const accessToken = await getFreshAccessToken(connection);

    if (action === "cancel") {
      if (!existingLink) return;
      if (connection.deleteCancelledEvents) {
        await provider.deleteEvent(accessToken, connection.calendarId, existingLink.externalEventId);
        await prisma.appointmentCalendarEvent.delete({ where: { id: existingLink.id } });
      } else {
        const content = buildEventContent(appointment);
        await provider.updateEvent(accessToken, connection.calendarId, existingLink.externalEventId, { ...content, summary: `ANNULÉ — ${content.summary}` });
        await prisma.appointmentCalendarEvent.update({ where: { id: existingLink.id }, data: { status: "SYNCED", lastError: null, lastSyncAt: new Date() } });
      }
      await prisma.calendarConnection.update({ where: { id: connection.id }, data: { lastSyncAt: new Date(), lastError: null } });
      return;
    }

    const content = buildEventContent(appointment);
    if (!existingLink) {
      const externalEventId = await provider.createEvent(accessToken, connection.calendarId, content);
      await prisma.appointmentCalendarEvent.create({
        data: { appointmentId: appointment.id, connectionId: connection.id, externalEventId, status: "SYNCED", lastSyncAt: new Date() },
      });
    } else {
      // Rattrape une connexion établie après coup (le lien n'existait pas
      // encore) : toujours créer une première fois, même si "syncUpdates"
      // est désactivé — ce réglage ne concerne que les modifications
      // ultérieures d'un événement déjà créé.
      if (existingLink.status === "SYNCED" && !connection.syncUpdates) return;
      await provider.updateEvent(accessToken, connection.calendarId, existingLink.externalEventId, content);
      await prisma.appointmentCalendarEvent.update({ where: { id: existingLink.id }, data: { status: "SYNCED", lastError: null, lastSyncAt: new Date() } });
    }
    await prisma.calendarConnection.update({ where: { id: connection.id }, data: { lastSyncAt: new Date(), lastError: null } });
  } catch (error) {
    // Jamais le jeton dans le log — seulement le message d'erreur (étape 22
    // du chantier calendrier).
    const message = error instanceof Error ? error.message : "Erreur de synchronisation inconnue.";
    console.error(`[calendar-sync] échec (connexion ${connection.id}, rendez-vous ${appointment.id}) : ${message}`);
    await prisma.calendarConnection.update({ where: { id: connection.id }, data: { lastError: message } }).catch(() => {});
    if (existingLink) {
      await prisma.appointmentCalendarEvent.update({ where: { id: existingLink.id }, data: { status: "ERROR", lastError: message } }).catch(() => {});
    }
  }
}

/**
 * Point d'entrée unique appelé par appointments-actions.ts après une
 * création/modification ("upsert") ou une annulation ("cancel"). Ne lève
 * jamais — chaque connexion échoue indépendamment (Promise.allSettled),
 * jamais de rendez-vous interne remis en cause par un échec Google.
 */
export async function syncAppointmentToCalendars(appointmentId: string, action: SyncAction): Promise<void> {
  const appointment = await prisma.appointment.findUnique({ where: { id: appointmentId }, include: { client: true } });
  if (!appointment) return;

  const connections = await getActiveConnectionsForProvider("GOOGLE");
  if (connections.length === 0) return;

  await Promise.allSettled(connections.map((connection) => syncOneConnection(connection, appointment, action)));
}
