"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/dal";
import { logAudit } from "@/lib/audit";
import type { AnimalSpecies } from "@/data/species";
import type { Appointment, AppointmentMode, AppointmentStatus } from "@/data/appointments";
import type { AppointmentStatus as DbAppointmentStatus, VisitMode } from "@/generated/prisma/client";

const dbMode: Record<AppointmentMode, VisitMode> = { cabinet: "CABINET", home: "DOMICILE" };
const modeLabel: Record<VisitMode, AppointmentMode> = { CABINET: "cabinet", DOMICILE: "home" };
const dbStatus: Record<AppointmentStatus, DbAppointmentStatus> = { pending: "PENDING", confirmed: "CONFIRMED", completed: "COMPLETED", cancelled: "CANCELLED" };
const statusLabel: Record<DbAppointmentStatus, AppointmentStatus> = { PENDING: "pending", CONFIRMED: "confirmed", COMPLETED: "completed", CANCELLED: "cancelled" };

function toDate(dateId: string): Date {
  return new Date(`${dateId}T00:00:00.000Z`);
}

function toAppointment(row: {
  id: string; date: Date; start: string; duration: number; clientId: string | null; clientName: string;
  animalId: string | null; animalName: string; animalSpecies: string | null; animal: { species: string } | null;
  serviceName: string; mode: VisitMode; location: string; price: number; status: DbAppointmentStatus; notes: string;
}): Appointment {
  return {
    id: row.id,
    date: row.date.toISOString().slice(0, 10),
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
  };
}

/**
 * Le cabinet et le domicile partagent un seul agenda : un créneau (même date,
 * même heure de départ) ne peut jamais être occupé par deux rendez-vous non
 * annulés à la fois, quel que soit le mode. Vérification best-effort (pas de
 * contrainte unique en base) : suffisante pour un praticien seul avec un
 * volume de réservations faible, mais laisse en théorie une fenêtre de
 * course en cas de deux écritures strictement simultanées.
 */
async function hasConflict(dateId: string, start: string, excludeId?: string): Promise<boolean> {
  const existing = await prisma.appointment.findFirst({
    where: {
      date: toDate(dateId),
      start,
      status: { not: "CANCELLED" },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
  });
  return existing !== null;
}

export type SaveAppointmentInput = {
  id?: string;
  date: string;
  start: string;
  duration: number;
  clientId?: string | null;
  clientName: string;
  animalId?: string | null;
  animalName: string;
  animalSpecies?: string | null;
  serviceName: string;
  mode: AppointmentMode;
  location: string;
  price: number;
  status: AppointmentStatus;
  notes: string;
};

export type AppointmentActionResult =
  | { ok: true; appointment: Appointment }
  | { ok: false; error: string };

export async function saveAppointmentAction(input: SaveAppointmentInput): Promise<AppointmentActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Session expirée, merci de vous reconnecter." };

  if (await hasConflict(input.date, input.start, input.id)) {
    return { ok: false, error: "Ce créneau est déjà occupé par un autre rendez-vous (cabinet ou domicile). Choisissez une autre heure." };
  }

  const data = {
    date: toDate(input.date),
    start: input.start,
    duration: input.duration,
    clientId: input.clientId ?? null,
    clientName: input.clientName,
    animalId: input.animalId ?? null,
    animalName: input.animalName,
    animalSpecies: input.animalSpecies ?? null,
    serviceName: input.serviceName,
    mode: dbMode[input.mode],
    location: input.location,
    price: input.price,
    status: dbStatus[input.status],
    notes: input.notes,
  };

  const row = input.id
    ? await prisma.appointment.update({ where: { id: input.id }, data, include: { animal: { select: { species: true } } } })
    : await prisma.appointment.create({ data, include: { animal: { select: { species: true } } } });

  await logAudit({
    userId: user.id,
    action: input.id ? "APPOINTMENT_UPDATED" : "APPOINTMENT_CREATED",
    entityType: "Appointment",
    entityId: row.id,
  });
  revalidatePath("/dashboard");

  return { ok: true, appointment: toAppointment(row) };
}

export async function updateAppointmentStatusAction(id: string, status: AppointmentStatus): Promise<AppointmentActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Session expirée, merci de vous reconnecter." };

  if (status !== "cancelled") {
    const current = await prisma.appointment.findUnique({ where: { id } });
    if (current && await hasConflict(current.date.toISOString().slice(0, 10), current.start, id)) {
      return { ok: false, error: "Impossible : un autre rendez-vous occupe déjà ce créneau." };
    }
  }

  const row = await prisma.appointment.update({ where: { id }, data: { status: dbStatus[status] }, include: { animal: { select: { species: true } } } });
  await logAudit({ userId: user.id, action: "APPOINTMENT_STATUS_CHANGED", entityType: "Appointment", entityId: id, metadata: { status } });
  revalidatePath("/dashboard");

  return { ok: true, appointment: toAppointment(row) };
}

export type PublicBookingInput = {
  date: string;
  start: string;
  duration: number;
  clientName: string;
  animalName: string;
  serviceName: string;
  mode: AppointmentMode;
  location: string;
  price: number;
  notes: string;
  // Issues de l'autocomplétion d'adresse (Géoplateforme IGN) pour un
  // rendez-vous à domicile ; absentes pour le cabinet ou une saisie
  // manuelle. Toujours revalidées ci-dessous avant écriture : ce sont des
  // données saisies/relayées côté client, jamais garanties valides.
  postalCode?: string;
  city?: string;
  inseeCode?: string;
  latitude?: number;
  longitude?: number;
};

export type PublicBookingResult = { ok: true; id: string } | { ok: false; error: string };

/**
 * Les champs géocodés sont un bonus (carte, tournées, distances futures) :
 * une valeur absente ou mal formée ne doit jamais faire échouer la demande
 * de rendez-vous, elle est simplement ignorée (stockée à null).
 */
const geoFieldsSchema = z.object({
  postalCode: z.string().regex(/^\d{5}$/).optional(),
  city: z.string().trim().min(1).max(200).optional(),
  inseeCode: z.string().regex(/^(\d{2}|2[AB])\d{3}$/i).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
});

function sanitizeGeoFields(input: PublicBookingInput) {
  const parsed = geoFieldsSchema.safeParse({
    postalCode: input.postalCode,
    city: input.city,
    inseeCode: input.inseeCode,
    latitude: input.latitude,
    longitude: input.longitude,
  });
  return parsed.success ? parsed.data : {};
}

/**
 * Point d'entrée public (appelé depuis /reserver, sans session) : crée une
 * demande de rendez-vous PENDING directement en base, avec la même
 * vérification de conflit que côté dashboard, pour qu'un client ne puisse
 * jamais réserver un créneau déjà pris — cabinet ou domicile confondus.
 */
export async function submitPublicBookingAction(input: PublicBookingInput): Promise<PublicBookingResult> {
  if (await hasConflict(input.date, input.start)) {
    return { ok: false, error: "Ce créneau vient d’être réservé par quelqu’un d’autre. Merci d’en choisir un autre." };
  }

  const geoFields = sanitizeGeoFields(input);

  const row = await prisma.appointment.create({
    data: {
      date: toDate(input.date),
      start: input.start,
      duration: input.duration,
      clientName: input.clientName,
      animalName: input.animalName,
      serviceName: input.serviceName,
      mode: dbMode[input.mode],
      location: input.location,
      postalCode: geoFields.postalCode ?? null,
      city: geoFields.city ?? null,
      inseeCode: geoFields.inseeCode ?? null,
      latitude: geoFields.latitude ?? null,
      longitude: geoFields.longitude ?? null,
      price: input.price,
      status: "PENDING",
      notes: input.notes,
    },
  });

  await logAudit({ action: "APPOINTMENT_CREATED", entityType: "Appointment", entityId: row.id, metadata: { source: "public_booking" } });
  revalidatePath("/dashboard");

  return { ok: true, id: row.id };
}

function minutesToTime(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function timeToMinutes(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

/**
 * Lecture publique (sans session) des créneaux déjà occupés sur une période :
 * ne renvoie que date + heure, jamais l'identité du client, pour alimenter
 * le calendrier de réservation sans exposer de données personnelles. Les
 * créneaux bloqués par le praticien (BlockedSlot) sont inclus de la même
 * façon, en générant tous les repères de 15 min couverts par leur plage.
 */
export async function getOccupiedSlotsAction(fromDateId: string, toDateId: string): Promise<Record<string, string[]>> {
  const range = { gte: toDate(fromDateId), lte: new Date(`${toDateId}T23:59:59.999Z`) };

  const [appointmentRows, blockedRows] = await Promise.all([
    prisma.appointment.findMany({ where: { status: { not: "CANCELLED" }, date: range }, select: { date: true, start: true } }),
    prisma.blockedSlot.findMany({ where: { date: range }, select: { date: true, startTime: true, endTime: true } }),
  ]);

  const result: Record<string, string[]> = {};
  for (const row of appointmentRows) {
    const id = row.date.toISOString().slice(0, 10);
    (result[id] ??= []).push(row.start);
  }
  for (const row of blockedRows) {
    const id = row.date.toISOString().slice(0, 10);
    const startMinutes = timeToMinutes(row.startTime);
    const endMinutes = timeToMinutes(row.endTime);
    for (let minutes = startMinutes; minutes < endMinutes; minutes += 15) {
      (result[id] ??= []).push(minutesToTime(minutes));
    }
  }
  return result;
}
