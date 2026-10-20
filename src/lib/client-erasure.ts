import "server-only";

import { Prisma } from "@/generated/prisma/client";
import type { ScopedPrismaClient } from "@/lib/db";
import { syncAppointmentToCalendars } from "@/lib/calendar/calendar-sync";
import { eraseMailjetContactIfUnused } from "@/lib/mailjet-erasure";

/** Ce qui reste d'un client supprimé dans l'historique de l'espace. */
export const ERASED_CLIENT_LABEL = "Client supprimé";
export const ERASED_ANIMAL_LABEL = "Animal supprimé";

export type ClientErasure = { appointmentIds: string[]; email: string };

/**
 * Supprimer un client l'efface vraiment (audit 2026-10, RGPD-03). Avant, la
 * fiche partait mais son nom, son adresse, la position de son domicile et
 * les notes restaient dans ses rendez-vous et ses arrêts de tournée, et
 * continuaient d'être publiés (flux d'agenda, Google Agenda).
 *
 * Règle décidée par Loïc le 2026-10-19 :
 * - rendez-vous gardés pour les statistiques (date, prestation, tarif,
 *   mode, statut), mais sans nom, animal, adresse, position ni notes ;
 * - rendez-vous à venir (en attente ou confirmés) annulés, et retirés des
 *   tournées : ils ne peuvent plus avoir lieu ;
 * - arrêts de tournée passés anonymisés ;
 * - comptes rendus conservés (dossier du cabinet), ce que l'écran dit ;
 * - animaux, consultations et relances partent en cascade (schéma).
 *
 * Tout dans une transaction : la fiche n'est supprimée que si l'historique a
 * bien été anonymisé. Google et Mailjet viennent après (eraseClientOutside).
 */
export async function eraseClient(db: ScopedPrismaClient, clientId: string, now: Date = new Date()): Promise<ClientErasure | null> {
  const client = await db.client.findUnique({ where: { id: clientId }, select: { id: true, email: true } });
  if (!client) return null;

  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const appointments = await db.appointment.findMany({ where: { clientId }, select: { id: true, date: true, status: true } });
  const appointmentIds = appointments.map((appointment) => appointment.id);
  const upcoming = new Set(appointments
    .filter((appointment) => appointment.date >= today && (appointment.status === "PENDING" || appointment.status === "CONFIRMED"))
    .map((appointment) => appointment.id));

  await db.$transaction(async (tx) => {
    if (appointmentIds.length > 0) {
      await tx.appointment.updateMany({
        where: { id: { in: appointmentIds } },
        data: { clientName: ERASED_CLIENT_LABEL, animalName: ERASED_ANIMAL_LABEL, location: "", postalCode: null, city: null, inseeCode: null, latitude: null, longitude: null, notes: "" },
      });
    }
    if (upcoming.size > 0) {
      await tx.appointment.updateMany({ where: { id: { in: [...upcoming] } }, data: { status: "CANCELLED" } });
      await tx.appointmentSlotOption.deleteMany({ where: { appointmentId: { in: [...upcoming] } } });
    }

    const stops = appointmentIds.length > 0
      ? await tx.tourStop.findMany({ where: { appointmentId: { in: appointmentIds } }, select: { id: true, tourRunId: true, appointmentId: true } })
      : [];
    const removed = stops.filter((stop) => stop.appointmentId && upcoming.has(stop.appointmentId));
    const kept = stops.filter((stop) => !removed.includes(stop));
    if (kept.length > 0) {
      await tx.tourStop.updateMany({ where: { id: { in: kept.map((stop) => stop.id) } }, data: { label: ERASED_CLIENT_LABEL, address: null, latitude: null, longitude: null, notes: null } });
    }
    if (removed.length > 0) {
      await tx.tourStop.deleteMany({ where: { id: { in: removed.map((stop) => stop.id) } } });
      // Arrêts renumérotés sans trou, et itinéraire à recalculer : l'ancien
      // passait par un domicile qui n'est plus dans la tournée.
      for (const tourRunId of new Set(removed.map((stop) => stop.tourRunId))) {
        const remaining = await tx.tourStop.findMany({ where: { tourRunId }, orderBy: { order: "asc" }, select: { id: true } });
        for (const [index, stop] of remaining.entries()) {
          await tx.tourStop.update({ where: { id: stop.id }, data: { order: index } });
        }
        await tx.tourRun.update({ where: { id: tourRunId }, data: { routeGeometry: Prisma.DbNull, routeComputedAt: null, totalDistanceMeters: null, totalDurationSeconds: null } });
      }
    }

    await tx.client.delete({ where: { id: clientId } });
  });

  return { appointmentIds, email: client.email };
}

/**
 * La suite de l'effacement, hors de la base : les événements de l'agenda
 * Google, puis le contact chez Mailjet — sauf si la même adresse sert encore
 * ailleurs. Ne lève jamais.
 */
export async function eraseClientOutside(organizationId: string, erasure: ClientErasure): Promise<void> {
  await Promise.allSettled(erasure.appointmentIds.map((id) => syncAppointmentToCalendars(organizationId, id, "erase")));
  await eraseMailjetContactIfUnused(erasure.email).catch(() => {});
}
