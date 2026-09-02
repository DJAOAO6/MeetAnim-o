import "server-only";
import { prisma } from "@/lib/db";
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
}): Appointment {
  return {
    id: row.id,
    date: toIsoDate(row.date),
    start: row.start,
    duration: row.duration,
    clientId: row.clientId ?? undefined,
    clientName: row.clientName,
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

export async function getAppointments(): Promise<Appointment[]> {
  const appointments = await prisma.appointment.findMany({
    orderBy: { date: "asc" },
    include: { animal: { select: { species: true } } },
  });

  return appointments.map((appointment) => ({
    id: appointment.id,
    date: toIsoDate(appointment.date),
    start: appointment.start,
    duration: appointment.duration,
    clientId: appointment.clientId ?? undefined,
    clientName: appointment.clientName,
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
