"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/dal";
import { logAudit } from "@/lib/audit";
import { avatarBackgroundFor, avatarForSpecies } from "@/data/animal-visuals";
import type { AnimalSpecies } from "@/data/species";
import type { Appointment, AppointmentMode, AppointmentStatus } from "@/data/appointments";
import type { AppointmentStatus as DbAppointmentStatus, VisitMode } from "@/generated/prisma/client";
import { computeAgeLabel } from "@/lib/animal-age";
import { bookingLimitDate, bookingProfessionals } from "@/data/public-booking";
import { getPublicServices } from "@/lib/services-actions";
import {
  computeTotalPrice,
  findServiceById,
  isBookingDateAcceptable,
  isModeAvailableForService,
  publicBookingCoreSchema,
} from "@/lib/booking-validation";

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
  // Référence vers une prestation existante : le prix, la durée et le nom
  // affiché sont toujours relus depuis getPublicServices() côté serveur,
  // jamais acceptés tels quels depuis le client (cf. doc Next.js sur les
  // Server Actions : « send a reference, re-read the rest from a trusted
  // source »). date/start/mode/serviceId/clientName/animalName sont validés
  // par publicBookingCoreSchema (src/lib/booking-validation.ts).
  serviceId: string;
  date: string;
  start: string;
  clientName: string;
  animalName: string;
  mode: AppointmentMode;
  location: string;
  notes: string;
  // Horodatage (Date.now() côté client) pris au montage du tunnel : sert de
  // signal anti-bot best-effort (délai minimum de remplissage), combiné au
  // rate limiting. Absent → traité comme suspect.
  bookingStartedAt?: number;
  // Issues de l'autocomplétion d'adresse (Géoplateforme IGN) pour un
  // rendez-vous à domicile ; absentes pour le cabinet ou une saisie
  // manuelle. Toujours revalidées ci-dessous avant écriture : ce sont des
  // données saisies/relayées côté client, jamais garanties valides.
  postalCode?: string;
  city?: string;
  inseeCode?: string;
  latitude?: number;
  longitude?: number;
  // Coordonnées et animal saisis sur la page de réservation publique, utilisés
  // pour rattacher la demande à une fiche Client/Animal réelle (voir
  // findOrCreateClientAndAnimal). Comme les champs géocodés ci-dessus, jamais
  // garantis valides côté serveur : revalidés avant toute écriture.
  ownerFirstName?: string;
  ownerLastName?: string;
  ownerPhone?: string;
  ownerEmail?: string;
  ownerAddress?: string;
  ownerCity?: string;
  animalSpecies?: string;
  animalBreed?: string;
  animalBirthDate?: string;
  animalBirthDateApproximate?: boolean;
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

const ownerFieldsSchema = z.object({
  firstName: z.string().trim().min(1).max(200).optional(),
  lastName: z.string().trim().min(1).max(200).optional(),
  phone: z.string().trim().min(1).max(50).optional(),
  email: z.string().trim().toLowerCase().email().max(320).optional(),
  address: z.string().trim().max(500).optional(),
  city: z.string().trim().max(200).optional(),
});

const animalFieldsSchema = z.object({
  species: z.enum(["Chien", "Chat", "Cheval", "NAC", "Petit ruminant"]).optional(),
  breed: z.string().trim().max(200).optional(),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  birthDateApproximate: z.boolean().optional(),
});

function sanitizeOwnerFields(input: PublicBookingInput) {
  const parsed = ownerFieldsSchema.safeParse({
    firstName: input.ownerFirstName,
    lastName: input.ownerLastName,
    phone: input.ownerPhone,
    email: input.ownerEmail,
    address: input.ownerAddress,
    city: input.ownerCity,
  });
  return parsed.success ? parsed.data : {};
}

function sanitizeAnimalFields(input: PublicBookingInput) {
  const parsed = animalFieldsSchema.safeParse({
    species: input.animalSpecies,
    breed: input.animalBreed,
    birthDate: input.animalBirthDate,
    birthDateApproximate: input.animalBirthDateApproximate,
  });
  return parsed.success ? parsed.data : {};
}

/**
 * Rattache la demande de réservation publique à une vraie fiche Client/Animal
 * plutôt que de laisser ces informations se perdre dans les seuls champs
 * texte de l'Appointment (clientName/animalName). Recherche du client par
 * email (insensible à la casse) pour éviter les doublons d'une réservation à
 * l'autre ; l'animal est recherché par nom au sein de ce client. Best-effort
 * uniquement : une donnée manquante ou invalide fait renoncer à la
 * création/liaison plutôt que d'échouer la demande de rendez-vous.
 */
async function findOrCreateClientAndAnimal(input: PublicBookingInput): Promise<{ clientId: string | null; animalId: string | null }> {
  try {
    const owner = sanitizeOwnerFields(input);
    if (!owner.email || !owner.firstName || !owner.lastName) {
      return { clientId: null, animalId: null };
    }

    let client = await prisma.client.findFirst({ where: { email: { equals: owner.email, mode: "insensitive" } } });
    if (!client) {
      client = await prisma.client.create({
        data: {
          firstName: owner.firstName,
          lastName: owner.lastName,
          phone: owner.phone ?? "",
          email: owner.email,
          city: owner.city ?? "",
          address: owner.address ?? "",
        },
      });
    }

    const animalName = input.animalName.trim();
    if (!animalName) {
      return { clientId: client.id, animalId: null };
    }

    let animal = await prisma.animal.findFirst({
      where: { clientId: client.id, name: { equals: animalName, mode: "insensitive" } },
    });

    if (!animal) {
      const animalFields = sanitizeAnimalFields(input);
      const species = animalFields.species ?? "Chien";
      const birthDate = animalFields.birthDate ? new Date(`${animalFields.birthDate}T00:00:00.000Z`) : null;
      const birthDateApproximate = animalFields.birthDateApproximate ?? false;
      const ageLabel = computeAgeLabel({ date: animalFields.birthDate ?? "", approximate: birthDateApproximate }) ?? "";

      animal = await prisma.animal.create({
        data: {
          clientId: client.id,
          name: animalName,
          species,
          breed: animalFields.breed ?? "",
          age: ageLabel,
          birthDate,
          birthDateApproximate,
          weight: "",
          sex: "",
          avatar: avatarForSpecies(species),
          avatarBackground: avatarBackgroundFor(`${client.id}-${animalName}`),
          history: "",
          conditions: "",
          treatments: "",
          notes: "",
        },
      });
    }

    return { clientId: client.id, animalId: animal.id };
  } catch {
    return { clientId: null, animalId: null };
  }
}

// bookingLimitDate est construit via new Date(year, month, day, 12) (heure
// locale) : on relit ses composantes avec les mêmes accesseurs locaux pour
// rester cohérent avec la génération de bookingDates côté client
// (src/data/public-booking.ts), plutôt que de risquer un décalage via .toISOString().
function toLocalDateId(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/**
 * Point d'entrée public (appelé depuis /reserver, sans session) : crée une
 * demande de rendez-vous PENDING directement en base, avec la même
 * vérification de conflit que côté dashboard, pour qu'un client ne puisse
 * jamais réserver un créneau déjà pris — cabinet ou domicile confondus.
 *
 * Comme le rappelle la documentation Next.js sur les Server Actions, ce
 * point d'entrée est une route POST atteignable par quiconque peut envoyer
 * la même requête, pas seulement par le tunnel de réservation : chaque champ
 * est donc revalidé ici, et le prix n'est jamais accepté tel quel depuis le
 * client — il est entièrement recalculé à partir de la prestation réelle.
 */
export async function submitPublicBookingAction(input: PublicBookingInput): Promise<PublicBookingResult> {
  const parsedCore = publicBookingCoreSchema.safeParse(input);
  if (!parsedCore.success) {
    return { ok: false, error: "Demande invalide. Merci de recommencer depuis le début du formulaire." };
  }
  const core = parsedCore.data;

  // Fenêtre "aujourd'hui" en UTC : cohérent avec toDate() ci-dessus (ancrage
  // UTC minuit). Une normalisation explicite au fuseau du praticien
  // (Europe/Paris) reste à faire à la Phase 2, en même temps que la
  // génération des créneaux depuis les vraies disponibilités.
  const todayId = new Date().toISOString().slice(0, 10);
  const limitId = toLocalDateId(bookingLimitDate);
  if (!isBookingDateAcceptable(core.date, todayId, limitId)) {
    return { ok: false, error: "Cette date n’est plus disponible. Merci de choisir une date à venir." };
  }

  if (await hasConflict(core.date, core.start)) {
    return { ok: false, error: "Ce créneau vient d’être réservé par quelqu’un d’autre. Merci d’en choisir un autre." };
  }

  const services = await getPublicServices();
  const service = findServiceById(services, core.serviceId);
  if (!service) {
    return { ok: false, error: "Cette prestation n’est plus disponible. Merci de recommencer depuis le début du formulaire." };
  }
  if (!isModeAvailableForService(service, core.mode)) {
    return { ok: false, error: "Ce mode de consultation n’est plus proposé pour cette prestation." };
  }

  const geoFields = sanitizeGeoFields(input);
  const animalFields = sanitizeAnimalFields(input);
  const { clientId, animalId } = await findOrCreateClientAndAnimal(input);

  // Les zones (et donc les frais de déplacement en mode "zone") restent une
  // donnée de démonstration statique tant que la Phase 2 ne les a pas
  // branchées sur de vraies zones en base — voir AUDIT-FINDINGS.md §3.A.
  const zones = bookingProfessionals[0]?.zones ?? [];
  const price = computeTotalPrice(service, core.mode, zones, geoFields.postalCode, geoFields.city);

  const row = await prisma.appointment.create({
    data: {
      clientId,
      animalId,
      date: toDate(core.date),
      start: core.start,
      duration: service.duration,
      clientName: core.clientName,
      animalName: core.animalName,
      animalSpecies: animalFields.species ?? null,
      serviceName: service.name,
      mode: dbMode[core.mode],
      location: core.location,
      postalCode: geoFields.postalCode ?? null,
      city: geoFields.city ?? null,
      inseeCode: geoFields.inseeCode ?? null,
      latitude: geoFields.latitude ?? null,
      longitude: geoFields.longitude ?? null,
      price,
      status: "PENDING",
      notes: core.notes,
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
