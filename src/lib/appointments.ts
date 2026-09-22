import "server-only";
import { currentDb } from "@/lib/organization";
import type { AnimalSpecies } from "@/data/species";
import type { Appointment, AppointmentMode, AppointmentStatus } from "@/data/appointments";
import type { AppointmentStatus as DbAppointmentStatus, VisitMode } from "@/generated/prisma/client";

const modeLabel: Record<VisitMode, AppointmentMode> = {
  CABINET: "cabinet",
  DOMICILE: "home",
};

const statusLabel: Record<DbAppointmentStatus, AppointmentStatus> = {
  PENDING: "pending",
  CONFIRMED: "confirmed",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
};

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Exportée pour appointments-actions.ts et tour-runs-actions.ts (unification
 * des tournées, phase 3 ter) : un fichier "use server" ne peut exporter que
 * des fonctions async (contrainte Next.js) — ce mapper, purement
 * synchrone, vit donc ici plutôt que dans appointments-actions.ts.
 */
export function toAppointment(row: {
  id: string; date: Date; start: string; duration: number; clientId: string | null; clientName: string;
  animalId: string | null; animalName: string; animalSpecies: string | null; animal: { species: string } | null;
  serviceName: string; mode: VisitMode; location: string; price: number; status: DbAppointmentStatus; notes: string;
  postalCode?: string | null; city?: string | null; latitude?: number | null; longitude?: number | null;
  client?: { phone: string } | null;
}): Appointment {
  return {
    id: row.id,
    date: toIsoDate(row.date),
    start: row.start,
    duration: row.duration,
    clientId: row.clientId ?? undefined,
    clientName: row.clientName,
    clientPhone: row.client?.phone ?? undefined,
    animalId: row.animalId ?? undefined,
    animalName: row.animalName,
    animalSpecies: (row.animal?.species ?? row.animalSpecies ?? undefined) as AnimalSpecies | undefined,
    serviceName: row.serviceName,
    mode: modeLabel[row.mode],
    location: row.location,
    price: row.price,
    status: statusLabel[row.status],
    notes: row.notes,
    postalCode: row.postalCode ?? undefined,
    city: row.city ?? undefined,
    latitude: row.latitude ?? undefined,
    longitude: row.longitude ?? undefined,
  };
}

/** Période de rendez-vous, bornes incluses (identifiants YYYY-MM-DD). */
export type AppointmentRange = { from: string; to: string };

/**
 * Fenêtre chargée d'office dans l'espace pro : 2 mois en arrière, 6 en
 * avant. C'est ce dont le tableau de bord (semaine, mois) et l'agenda
 * courant ont besoin. Le reste — l'agenda qui remonte dans le passé, la vue
 * « année », les filtres « passés » et « tous » — est chargé à la demande
 * (AppointmentsProvider.ensureRange).
 *
 * Jusqu'ici tout l'historique partait avec chaque page, et de nouveau à
 * chaque rafraîchissement automatique (toutes les 60 s) : ~466 octets par
 * rendez-vous, sérialisés deux fois — 4,4 Mo par page à 5 000 rendez-vous,
 * sans limite avec les années.
 */
export function defaultAppointmentRange(now: Date = new Date()): AppointmentRange {
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1));
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 7, 0));
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

export async function getAppointments(range: AppointmentRange): Promise<Appointment[]> {
  const db = await currentDb();
  const appointments = await db.appointment.findMany({
    where: { date: { gte: new Date(`${range.from}T00:00:00.000Z`), lte: new Date(`${range.to}T00:00:00.000Z`) } },
    orderBy: { date: "asc" },
    include: { animal: { select: { species: true } }, client: { select: { phone: true } } },
  });

  return appointments.map((appointment) => ({
    id: appointment.id,
    date: toIsoDate(appointment.date),
    start: appointment.start,
    duration: appointment.duration,
    clientId: appointment.clientId ?? undefined,
    clientName: appointment.clientName,
    clientPhone: appointment.client?.phone ?? undefined,
    animalId: appointment.animalId ?? undefined,
    animalName: appointment.animalName,
    animalSpecies: (appointment.animal?.species ?? appointment.animalSpecies ?? undefined) as AnimalSpecies | undefined,
    serviceName: appointment.serviceName,
    mode: modeLabel[appointment.mode],
    location: appointment.location,
    price: appointment.price,
    status: statusLabel[appointment.status],
    notes: appointment.notes,
  }));
}
