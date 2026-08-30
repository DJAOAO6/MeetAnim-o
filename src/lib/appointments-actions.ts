"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/dal";
import { logAudit } from "@/lib/audit";
import { isRateLimited, recordAttempt } from "@/lib/rate-limit";
import { avatarBackgroundFor, avatarForSpecies } from "@/data/animal-visuals";
import type { AnimalSpecies } from "@/data/species";
import type { Appointment, AppointmentMode, AppointmentStatus } from "@/data/appointments";
import type { AppointmentStatus as DbAppointmentStatus, VisitMode } from "@/generated/prisma/client";
import { computeAgeLabel } from "@/lib/animal-age";
import { getPublicZones } from "@/lib/tours";
import { getPublicServices } from "@/lib/services-actions";
import { getBookingWindowStartId } from "@/lib/public-schedule";
import { getAvailability, getBusinessProfile } from "@/lib/business-profile-actions";
import { getEmailProvider } from "@/lib/email/provider";
import { bookingRequestClientTemplate, bookingRequestProfessionalTemplate } from "@/lib/email/templates";
import {
  BOOKING_WINDOW_DAYS,
  computeTotalPrice,
  findServiceById,
  formatBookingDateLabels,
  formatBookingReference,
  intervalsOverlap,
  isBookingDateAcceptable,
  isModeAvailableForService,
  parseDateIdToLocalNoon,
  passesMinimumFillTime,
  publicBookingCoreSchema,
  timeToMinutes,
  toLocalDateId,
} from "@/lib/booking-validation";
import { Prisma } from "@/generated/prisma/client";

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
 * Le cabinet et le domicile partagent un seul agenda : un rendez-vous ne
 * peut jamais chevaucher un autre rendez-vous non annulé, quel que soit le
 * mode. Compare de vrais intervalles [start, start+duration) plutôt qu'une
 * égalité stricte sur l'heure de départ — un soin de 60 min à 09:00 doit
 * bloquer 09:30, pas seulement une nouvelle demande à 09:00 pile.
 *
 * Reste une vérification applicative (pas une contrainte SQL sur
 * intervalles, disproportionnée ici) : la migration
 * 20260828104850_add_appointment_slot_unique_constraint ajoute un filet de
 * sécurité en base, mais seulement pour la duplication exacte d'un même
 * horaire de départ — voir handlePotentialSlotConflict ci-dessous pour le
 * cas où cette vérification applicative perdrait malgré tout la course.
 */
async function hasConflict(dateId: string, start: string, duration: number, excludeId?: string): Promise<boolean> {
  const [sameDayAppointments, availability] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        date: toDate(dateId),
        status: { not: "CANCELLED" },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { start: true, duration: true, mode: true },
    }),
    getAvailability(),
  ]);

  const startMinutes = timeToMinutes(start);
  return sameDayAppointments.some((appointment) => {
    // « Temps de déplacement » (AUDIT_COMPLET.md P2-20) : un rendez-vous à
    // domicile occupe, pour le calcul de conflit, sa durée réelle + le
    // temps de trajet configuré après sa fin, avant qu'un autre rendez-vous
    // (cabinet ou domicile) puisse démarrer.
    const bufferedDuration = appointment.mode === "DOMICILE" ? appointment.duration + availability.travelBuffer : appointment.duration;
    return intervalsOverlap(startMinutes, duration, timeToMinutes(appointment.start), bufferedDuration);
  });
}

/**
 * P2002 (contrainte unique violée) ne peut venir que de l'index partiel sur
 * (date, start) : c'est la même course que hasConflict() vérifie déjà en
 * amont, juste perdue de justesse. Reconvertit cette erreur bas niveau en
 * message utilisateur cohérent avec celui de hasConflict, plutôt que de
 * laisser remonter une exception Prisma brute.
 */
function isSlotUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
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

  if (await hasConflict(input.date, input.start, input.duration, input.id)) {
    return { ok: false, error: "Ce créneau chevauche un autre rendez-vous (cabinet ou domicile). Choisissez une autre heure." };
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

  let row;
  try {
    row = input.id
      ? await prisma.appointment.update({ where: { id: input.id }, data, include: { animal: { select: { species: true } } } })
      : await prisma.appointment.create({ data, include: { animal: { select: { species: true } } } });
  } catch (error) {
    if (isSlotUniqueConstraintError(error)) {
      return { ok: false, error: "Ce créneau vient d’être pris par un autre rendez-vous. Choisissez une autre heure." };
    }
    throw error;
  }

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
    if (current && await hasConflict(current.date.toISOString().slice(0, 10), current.start, current.duration, id)) {
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
type FindOrCreateResult = { clientId: string | null; animalId: string | null; createdClientId: string | null; createdAnimalId: string | null };

async function findOrCreateClientAndAnimal(input: PublicBookingInput): Promise<FindOrCreateResult> {
  try {
    const owner = sanitizeOwnerFields(input);
    if (!owner.email || !owner.firstName || !owner.lastName) {
      return { clientId: null, animalId: null, createdClientId: null, createdAnimalId: null };
    }

    let client = await prisma.client.findFirst({ where: { email: { equals: owner.email, mode: "insensitive" } } });
    let createdClientId: string | null = null;
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
      createdClientId = client.id;
    }

    const animalName = input.animalName.trim();
    if (!animalName) {
      return { clientId: client.id, animalId: null, createdClientId, createdAnimalId: null };
    }

    let animal = await prisma.animal.findFirst({
      where: { clientId: client.id, name: { equals: animalName, mode: "insensitive" } },
    });
    let createdAnimalId: string | null = null;

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
      createdAnimalId = animal.id;
    }

    return { clientId: client.id, animalId: animal.id, createdClientId, createdAnimalId };
  } catch {
    return { clientId: null, animalId: null, createdClientId: null, createdAnimalId: null };
  }
}

/**
 * Nettoyage best-effort de la fiche Client/Animal qu'on vient de créer si la
 * création du rendez-vous échoue juste après (AUDIT_COMPLET.md P2-21) —
 * uniquement les enregistrements réellement créés par cet appel, jamais une
 * fiche préexistante trouvée par email/nom. Un échec de suppression ne doit
 * jamais empêcher de répondre à l'utilisateur : l'orphelin resterait alors,
 * mais inoffensif (déjà le statu quo avant cette correction).
 */
async function cleanupOrphanedClientAndAnimal(result: FindOrCreateResult): Promise<void> {
  try {
    if (result.createdAnimalId) await prisma.animal.delete({ where: { id: result.createdAnimalId } });
    if (result.createdClientId) await prisma.client.delete({ where: { id: result.createdClientId } });
  } catch {
    // Best-effort : voir la note ci-dessus.
  }
}

async function requestIp(): Promise<string> {
  const headerList = await headers();
  return headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

// Une demande de rendez-vous n'est pas un geste anodin qu'on répète des
// dizaines de fois par minute : ces limites laissent large place à un
// visiteur qui recommence après un créneau pris entre-temps, tout en
// bornant fortement le débit d'un script. Même schéma que le login
// (src/lib/auth/actions.ts) : clé par IP en plus de la clé par email, pour
// ne pas dépendre uniquement d'un champ que le client contrôle.
const bookingIpMaxAttempts = 8;
const bookingIpWindowMs = 15 * 60 * 1000;
const bookingEmailMaxAttempts = 5;
const bookingEmailWindowMs = 60 * 60 * 1000;

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
  const genericRetryError = "Impossible de traiter cette demande pour le moment. Merci de réessayer dans quelques instants.";

  const ip = await requestIp();
  const emailKey = (input.ownerEmail ?? "").trim().toLowerCase();
  if (
    await isRateLimited(`public-booking:ip:${ip}`, bookingIpMaxAttempts, bookingIpWindowMs)
    || (emailKey && await isRateLimited(`public-booking:email:${emailKey}`, bookingEmailMaxAttempts, bookingEmailWindowMs))
  ) {
    return { ok: false, error: "Trop de demandes envoyées récemment. Merci de réessayer dans quelques minutes." };
  }
  await recordAttempt(`public-booking:ip:${ip}`);
  if (emailKey) await recordAttempt(`public-booking:email:${emailKey}`);

  // Signal anti-bot best-effort : un envoi plus rapide que le temps humain
  // plausible pour remplir le tunnel est traité comme suspect, avec un
  // message générique plutôt qu'une explication qui renseignerait un bot sur
  // la défense en place.
  if (!passesMinimumFillTime(input.bookingStartedAt, Date.now())) {
    return { ok: false, error: genericRetryError };
  }

  const parsedCore = publicBookingCoreSchema.safeParse(input);
  if (!parsedCore.success) {
    return { ok: false, error: "Demande invalide. Merci de recommencer depuis le début du formulaire." };
  }
  const core = parsedCore.data;

  // Même fenêtre que celle réellement proposée par getPublicScheduleAction
  // (src/lib/public-schedule.ts) : demain (au fuseau du praticien, pas celui
  // du serveur) jusqu'à 90 jours plus tard. Recalculée ici plutôt que
  // transmise par le client, pour ne jamais faire confiance à une date de
  // référence envoyée depuis le navigateur.
  const startId = await getBookingWindowStartId();
  const limitDate = parseDateIdToLocalNoon(startId);
  limitDate.setDate(limitDate.getDate() + BOOKING_WINDOW_DAYS - 1);
  const limitId = toLocalDateId(limitDate);
  if (!isBookingDateAcceptable(core.date, startId, limitId)) {
    return { ok: false, error: "Cette date n’est plus disponible. Merci de choisir une date à venir." };
  }

  const services = await getPublicServices();
  const service = findServiceById(services, core.serviceId);
  if (!service) {
    return { ok: false, error: "Cette prestation n’est plus disponible. Merci de recommencer depuis le début du formulaire." };
  }
  if (!isModeAvailableForService(service, core.mode)) {
    return { ok: false, error: "Ce mode de consultation n’est plus proposé pour cette prestation." };
  }

  if (await hasConflict(core.date, core.start, service.duration)) {
    return { ok: false, error: "Ce créneau vient d’être réservé par quelqu’un d’autre. Merci d’en choisir un autre." };
  }

  const geoFields = sanitizeGeoFields(input);
  const animalFields = sanitizeAnimalFields(input);
  const clientAndAnimal = await findOrCreateClientAndAnimal(input);
  const { clientId, animalId } = clientAndAnimal;

  // Zones réellement configurées par le praticien (Tournées/Zones), et non
  // plus des données de démonstration figées — AUDIT_COMPLET.md P2-22.
  const zones = await getPublicZones();
  const price = computeTotalPrice(service, core.mode, zones, geoFields.postalCode, geoFields.city);

  let row;
  try {
    row = await prisma.appointment.create({
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
  } catch (error) {
    if (isSlotUniqueConstraintError(error)) {
      await cleanupOrphanedClientAndAnimal(clientAndAnimal);
      return { ok: false, error: "Ce créneau vient d’être réservé par quelqu’un d’autre. Merci d’en choisir un autre." };
    }
    throw error;
  }

  await logAudit({ action: "APPOINTMENT_CREATED", entityType: "Appointment", entityId: row.id, metadata: { source: "public_booking" } });
  revalidatePath("/dashboard");

  // Best-effort : la demande est déjà enregistrée en base à ce stade, un
  // échec d'envoi ne doit jamais faire échouer la réponse à l'utilisateur.
  // Les deux emails sont indépendants l'un de l'autre, envoyés en parallèle
  // plutôt que l'un après l'autre.
  const professional = await getBusinessProfile();
  const dateLabel = formatBookingDateLabels(core.date).fullLabel;
  const modeLabelText = core.mode === "cabinet" ? "Au cabinet" : "À domicile";
  const locationLabel = core.mode === "home" ? core.location : "";
  const reference = formatBookingReference(row.id);

  const emailResults = await Promise.allSettled([
    input.ownerEmail
      ? getEmailProvider().send({
          to: input.ownerEmail,
          ...bookingRequestClientTemplate({
            clientFirstName: input.ownerFirstName?.trim() || core.clientName,
            animalName: core.animalName,
            serviceName: service.name,
            dateLabel,
            time: core.start,
            modeLabel: modeLabelText,
            locationLabel,
            professionalFirstName: professional.firstName,
            professionalCompany: professional.company,
            professionalPhone: professional.phone,
            totalPrice: price,
            reference,
          }),
        })
      : Promise.resolve(),
    getEmailProvider().send({
      to: professional.email,
      ...bookingRequestProfessionalTemplate({
        professionalFirstName: professional.firstName,
        clientName: core.clientName,
        clientPhone: input.ownerPhone ?? "",
        clientEmail: input.ownerEmail ?? "",
        animalName: core.animalName,
        animalSpecies: animalFields.species ?? "",
        serviceName: service.name,
        dateLabel,
        time: core.start,
        modeLabel: modeLabelText,
        locationLabel,
        notes: core.notes,
      }),
    }),
  ]);
  for (const result of emailResults) {
    if (result.status === "rejected") console.error("Échec de l'envoi d'un email de confirmation de réservation :", result.reason);
  }

  return { ok: true, id: row.id };
}

export type OccupiedInterval = { start: string; duration: number };

// Lecture légitime plusieurs fois par session de réservation (chargement
// initial de la fenêtre de 90 jours, revalidation au choix d'une date,
// revalidation juste avant la soumission) — seuil large pour ne jamais
// gêner un vrai visiteur, tout en bornant le scraping/DoS léger signalé par
// l'audit (P2-15).
const occupiedSlotsMaxAttempts = 60;
const occupiedSlotsWindowMs = 5 * 60 * 1000;

/**
 * Lecture publique (sans session) des créneaux déjà occupés sur une période :
 * ne renvoie que date + horaire + durée, jamais l'identité du client, pour
 * alimenter le calendrier de réservation sans exposer de données
 * personnelles. Renvoie de vrais intervalles (pas seulement l'heure de
 * départ) pour que le client puisse calculer les mêmes recouvrements que
 * hasConflict() côté serveur, plutôt qu'une égalité stricte sur l'heure de
 * départ — voir intervalsOverlap (src/lib/booking-validation.ts). Les
 * créneaux bloqués par le praticien (BlockedSlot) sont inclus comme un seul
 * intervalle par plage, plutôt que découpés en repères de 15 min.
 */
export async function getOccupiedSlotsAction(fromDateId: string, toDateId: string): Promise<Record<string, OccupiedInterval[]>> {
  const ip = await requestIp();
  const rateLimitKey = `occupied-slots:ip:${ip}`;
  if (await isRateLimited(rateLimitKey, occupiedSlotsMaxAttempts, occupiedSlotsWindowMs)) {
    throw new Error("Trop de requêtes. Merci de réessayer dans quelques instants.");
  }
  await recordAttempt(rateLimitKey);

  const range = { gte: toDate(fromDateId), lte: new Date(`${toDateId}T23:59:59.999Z`) };

  const [appointmentRows, blockedRows, availability] = await Promise.all([
    prisma.appointment.findMany({ where: { status: { not: "CANCELLED" }, date: range }, select: { date: true, start: true, duration: true, mode: true } }),
    prisma.blockedSlot.findMany({ where: { date: range }, select: { date: true, startTime: true, endTime: true } }),
    getAvailability(),
  ]);

  const result: Record<string, OccupiedInterval[]> = {};
  for (const row of appointmentRows) {
    const id = row.date.toISOString().slice(0, 10);
    // Même règle de temps de déplacement que hasConflict() : un rendez-vous
    // à domicile occupe visuellement sa durée + le tampon configuré.
    const duration = row.mode === "DOMICILE" ? row.duration + availability.travelBuffer : row.duration;
    (result[id] ??= []).push({ start: row.start, duration });
  }
  for (const row of blockedRows) {
    const id = row.date.toISOString().slice(0, 10);
    const duration = timeToMinutes(row.endTime) - timeToMinutes(row.startTime);
    (result[id] ??= []).push({ start: row.startTime, duration });
  }
  return result;
}
