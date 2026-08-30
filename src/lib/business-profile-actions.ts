"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { hasPermission } from "@/lib/auth/permissions";
import { getDayAvailability } from "@/lib/availability";
import { fitsWithinOpenHours, parseDateIdToLocalNoon, timeToMinutes } from "@/lib/booking-validation";
import { initialSettings, type AvailabilitySettings, type ProfileSettings, type ReminderSettings } from "@/data/settings";
import type { Prisma } from "@/generated/prisma/client";

export type BusinessProfileData = ProfileSettings & {
  publicColor: string;
  cabinetAvailable: boolean;
  homeAvailable: boolean;
};

const DEFAULT_PROFILE: BusinessProfileData = {
  firstName: "Pauline",
  lastName: "Faucillon",
  profession: "Ostéopathe animalier",
  company: "PF Ostéo Animale",
  phone: "06 12 34 56 78",
  email: "pauline@pf-osteo-animale.fr",
  address: "24 rue des Carmes",
  postalCode: "76000",
  city: "Rouen",
  location: "Rouen et Normandie",
  bio: "J’accompagne chiens, chats et chevaux avec une approche douce et personnalisée.",
  slug: "pauline-faucillon",
  photo: "PF",
  logo: "PF",
  // #4FAF9F échouait au contraste WCAG AA (2,63:1) là où cette couleur sert
  // de texte sur la page de réservation publique (booking-header.tsx) —
  // AUDIT_COMPLET.md P1-4. Même teinte assombrie qu'ailleurs dans l'appli.
  publicColor: "#2F7A6E",
  cabinetAvailable: true,
  homeAvailable: true,
};

export async function getBusinessProfile(): Promise<BusinessProfileData> {
  const row = await prisma.businessProfile.findFirst();
  if (row) return row;
  const created = await prisma.businessProfile.create({ data: DEFAULT_PROFILE });
  return created;
}

export type BusinessProfileActionResult = { ok: true } | { ok: false; error: string };

export async function updateBusinessProfileAction(input: BusinessProfileData): Promise<BusinessProfileActionResult> {
  const user = await requireUser();
  if (!hasPermission(user, "MANAGE_PUBLIC_SETTINGS")) {
    return { ok: false, error: "Vous n'avez pas la permission de modifier les paramètres publics." };
  }

  const slug = input.slug.trim();
  if (!slug) return { ok: false, error: "Le lien public ne peut pas être vide." };

  const existing = await prisma.businessProfile.findFirst();
  // cabinetAvailable/homeAvailable sont volontairement omis de `data` et
  // gérés exclusivement par updateManualAvailabilityAction (badges du
  // tableau de bord) : ce formulaire ne capture leur valeur qu'une fois au
  // montage, un enregistrement de profil (bio, photo…) plus tard écraserait
  // sinon un état de fermeture entre-temps changé depuis le tableau de bord
  // avec une valeur périmée.
  const { cabinetAvailable, homeAvailable, ...profileFields } = input;
  const data = { ...profileFields, slug };

  try {
    if (existing) {
      await prisma.businessProfile.update({ where: { id: existing.id }, data });
    } else {
      await prisma.businessProfile.create({ data: { ...data, cabinetAvailable, homeAvailable } });
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("Unique constraint")) {
      return { ok: false, error: "Ce lien public est déjà utilisé." };
    }
    throw error;
  }

  revalidatePath(`/reserver/${slug}`);
  if (existing && existing.slug !== slug) revalidatePath(`/reserver/${existing.slug}`);
  revalidatePath("/dashboard/parametres");

  return { ok: true };
}

/**
 * Fermeture/réouverture manuelle Cabinet/Domicile, déclenchée depuis les
 * badges du tableau de bord. Persistée en base (cabinetAvailable/
 * homeAvailable, déjà lues côté serveur par /reserver/[slug] et
 * submitPublicBookingAction) plutôt qu'en localStorage — un réglage qui ne
 * survivait qu'au navigateur de la praticienne n'avait aucun effet réel sur
 * la réservation publique (AUDIT-PRODUIT-2026-08-30.md, finding P0 en tête).
 */
export async function updateManualAvailabilityAction(cabinetAvailable: boolean, homeAvailable: boolean): Promise<BusinessProfileActionResult> {
  const user = await requireUser();
  if (!hasPermission(user, "MANAGE_PUBLIC_SETTINGS")) {
    return { ok: false, error: "Vous n'avez pas la permission de modifier les disponibilités." };
  }

  const existing = await prisma.businessProfile.findFirst({ select: { id: true, slug: true } });
  if (existing) {
    await prisma.businessProfile.update({ where: { id: existing.id }, data: { cabinetAvailable, homeAvailable } });
    revalidatePath(`/reserver/${existing.slug}`);
  } else {
    const created = await prisma.businessProfile.create({ data: { ...DEFAULT_PROFILE, cabinetAvailable, homeAvailable } });
    revalidatePath(`/reserver/${created.slug}`);
  }

  revalidatePath("/dashboard");
  return { ok: true };
}

export async function getAvailability(): Promise<AvailabilitySettings> {
  const row = await prisma.businessProfile.findFirst({ select: { availability: true } });
  if (!row?.availability) return initialSettings.availability;
  // Colonne Json : un profil enregistré avant l'ajout de
  // defaultAppointmentDuration/slotInterval ne les a pas encore en base —
  // à distinguer d'un slotInterval valant explicitement 0 ("Désactivé").
  const stored = row.availability as unknown as AvailabilitySettings;
  return {
    ...stored,
    defaultAppointmentDuration: stored.defaultAppointmentDuration || initialSettings.availability.defaultAppointmentDuration,
    slotInterval: stored.slotInterval ?? initialSettings.availability.slotInterval,
  };
}

export type AvailabilityConflict = { appointmentId: string; date: string; start: string; clientName: string; animalName: string };
export type UpdateAvailabilityResult = { ok: true } | { ok: false; error: string; conflicts?: AvailabilityConflict[] };

/**
 * Rendez-vous confirmés/en attente à venir qui ne tiendraient plus dans la
 * nouvelle configuration de disponibilités (AUDIT_COMPLET.md P2-19) —
 * réutilise fitsWithinOpenHours, déjà couvert par des tests unitaires pour
 * le cas d'un rendez-vous qui chevauche plusieurs heures.
 */
async function findAvailabilityConflicts(newAvailability: AvailabilitySettings): Promise<AvailabilityConflict[]> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const upcoming = await prisma.appointment.findMany({
    where: { status: { in: ["CONFIRMED", "PENDING"] }, date: { gte: today } },
    select: { id: true, date: true, start: true, duration: true, mode: true, clientName: true, animalName: true },
  });

  const conflicts: AvailabilityConflict[] = [];
  for (const appointment of upcoming) {
    // appointment.date peut porter un horodatage non normalisé à minuit (bug
    // de qualité de données préexistant côté seed) — reconstruire une date
    // ancrée à midi heure locale à partir du jour calendaire UTC, pour que
    // .getDay() (utilisé par getDayAvailability) reflète toujours le bon
    // jour de la semaine, indépendamment du fuseau du serveur.
    const dateId = appointment.date.toISOString().slice(0, 10);
    const { hourly } = getDayAvailability(parseDateIdToLocalNoon(dateId), newAvailability);
    const mode = appointment.mode === "CABINET" ? "cabinet" : "home";
    const startMinutes = timeToMinutes(appointment.start);
    if (!fitsWithinOpenHours(hourly, mode, startMinutes, appointment.duration)) {
      conflicts.push({
        appointmentId: appointment.id,
        date: dateId,
        start: appointment.start,
        clientName: appointment.clientName,
        animalName: appointment.animalName,
      });
    }
  }
  return conflicts;
}

export async function updateAvailabilityAction(input: AvailabilitySettings, force = false): Promise<UpdateAvailabilityResult> {
  const user = await requireUser();
  if (!hasPermission(user, "MANAGE_PUBLIC_SETTINGS")) {
    return { ok: false, error: "Vous n'avez pas la permission de modifier les disponibilités." };
  }

  if (!force) {
    const conflicts = await findAvailabilityConflicts(input);
    if (conflicts.length > 0) {
      return {
        ok: false,
        error: `${conflicts.length} rendez-vous confirmé${conflicts.length > 1 ? "s" : ""} ne serai${conflicts.length > 1 ? "ent" : "t"} plus dans une plage disponible avec ces horaires.`,
        conflicts,
      };
    }
  }

  const existing = await prisma.businessProfile.findFirst({ select: { id: true } });
  if (existing) {
    await prisma.businessProfile.update({ where: { id: existing.id }, data: { availability: input as unknown as Prisma.InputJsonValue } });
  } else {
    await prisma.businessProfile.create({ data: { ...DEFAULT_PROFILE, availability: input as unknown as Prisma.InputJsonValue } });
  }

  revalidatePath("/dashboard/agenda");
  revalidatePath("/dashboard/parametres");
  revalidatePath("/dashboard");

  return { ok: true };
}

/**
 * Avant ce chantier, l'onglet Paramètres > Rappels n'écrivait que dans une
 * variable de module côté client (`sessionSettings`) : tout était perdu au
 * rechargement, malgré le toast "Modifications enregistrées"
 * (AUDIT-PRODUIT-2026-08-30.md, finding P0 §2). Même pattern Json que
 * getAvailability/updateAvailabilityAction ci-dessus.
 */
export async function getReminderSettings(): Promise<ReminderSettings> {
  const row = await prisma.businessProfile.findFirst({ select: { reminderSettings: true } });
  if (!row?.reminderSettings) return initialSettings.reminders;
  return row.reminderSettings as unknown as ReminderSettings;
}

export async function updateReminderSettingsAction(input: ReminderSettings): Promise<BusinessProfileActionResult> {
  const user = await requireUser();
  if (!hasPermission(user, "MANAGE_PUBLIC_SETTINGS")) {
    return { ok: false, error: "Vous n'avez pas la permission de modifier les réglages de rappels." };
  }

  const existing = await prisma.businessProfile.findFirst({ select: { id: true } });
  if (existing) {
    await prisma.businessProfile.update({ where: { id: existing.id }, data: { reminderSettings: input as unknown as Prisma.InputJsonValue } });
  } else {
    await prisma.businessProfile.create({ data: { ...DEFAULT_PROFILE, reminderSettings: input as unknown as Prisma.InputJsonValue } });
  }

  revalidatePath("/dashboard/rappels");
  revalidatePath("/dashboard/parametres");

  return { ok: true };
}
