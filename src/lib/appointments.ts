import "server-only";
import { prisma } from "@/lib/db";
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

export async function getAppointments(): Promise<Appointment[]> {
  const appointments = await prisma.appointment.findMany({ orderBy: { date: "asc" } });

  return appointments.map((appointment) => ({
    id: appointment.id,
    date: toIsoDate(appointment.date),
    start: appointment.start,
    duration: appointment.duration,
    clientName: appointment.clientName,
    animalName: appointment.animalName,
    serviceName: appointment.serviceName,
    mode: modeLabel[appointment.mode],
    location: appointment.location,
    price: appointment.price,
    status: statusLabel[appointment.status],
    notes: appointment.notes,
  }));
}
