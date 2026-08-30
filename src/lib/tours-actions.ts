"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { hasPermission } from "@/lib/auth/permissions";
import { getTours } from "@/lib/tours";
import type { City, Tour, Zone } from "@/data/tours";
import type { Tour as DbTour, TourStatus as DbTourStatus } from "@/generated/prisma/client";

const dbTourStatus: Record<Tour["status"], DbTourStatus> = { Active: "ACTIVE", Inactive: "INACTIVE" };
const tourStatusLabel: Record<DbTourStatus, Tour["status"]> = { ACTIVE: "Active", INACTIVE: "Inactive" };

/**
 * appointmentCount/consultationHours ne sont plus des colonnes (P2-25) :
 * recalculées depuis les vrais rendez-vous de la prochaine occurrence
 * (getTours(), déjà appelé pour toute la liste) plutôt que dupliquées ici.
 */
async function toTour(row: DbTour): Promise<Tour> {
  const tours = await getTours();
  const computed = tours.find((tour) => tour.id === row.id);
  return {
    id: row.id,
    name: row.name,
    recurrence: row.recurrence as Tour["recurrence"],
    day: row.day,
    dateId: row.dateId ?? undefined,
    dateLabel: row.dateLabel,
    startTime: row.startTime,
    endTime: row.endTime,
    zoneId: row.zoneId,
    status: tourStatusLabel[row.status],
    appointmentCount: computed?.appointmentCount ?? 0,
    estimatedKm: row.estimatedKm,
    consultationHours: computed?.consultationHours ?? "0h",
  };
}

async function revalidateToursPages() {
  revalidatePath("/dashboard/tournees");
  revalidatePath("/dashboard/carte");
  revalidatePath("/dashboard/parametres");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/agenda");
}

export type TourActionResult = { ok: true; tour: Tour } | { ok: false; error: string };

export type SaveTourInput = {
  id?: string;
  name: string;
  recurrence: Tour["recurrence"];
  day: string;
  startTime: string;
  endTime: string;
  zoneId: string;
  status: Tour["status"];
  estimatedKm: number;
};

export async function saveTourAction(input: SaveTourInput): Promise<TourActionResult> {
  const user = await requireUser();
  if (!hasPermission(user, "MANAGE_PUBLIC_SETTINGS")) {
    return { ok: false, error: "Vous n'avez pas la permission de gérer les tournées." };
  }

  const name = input.name.trim();
  if (!name) return { ok: false, error: "Le nom de la tournée est requis." };

  const zone = await prisma.zone.findUnique({ where: { id: input.zoneId } });
  if (!zone) return { ok: false, error: "Sélectionnez une zone valide." };

  const data = {
    name,
    recurrence: input.recurrence,
    day: input.day,
    startTime: input.startTime,
    endTime: input.endTime,
    zoneId: input.zoneId,
    status: dbTourStatus[input.status],
    estimatedKm: Math.max(0, input.estimatedKm),
  };

  const row = input.id
    ? await prisma.tour.update({ where: { id: input.id }, data })
    : await prisma.tour.create({ data: { ...data, dateLabel: `${input.day} · prochaine occurrence` } });

  await revalidateToursPages();
  return { ok: true, tour: await toTour(row) };
}

export async function toggleTourStatusAction(id: string): Promise<TourActionResult> {
  const user = await requireUser();
  if (!hasPermission(user, "MANAGE_PUBLIC_SETTINGS")) {
    return { ok: false, error: "Vous n'avez pas la permission de gérer les tournées." };
  }

  const existing = await prisma.tour.findUnique({ where: { id } });
  if (!existing) return { ok: false, error: "Cette tournée n'existe plus." };

  const row = await prisma.tour.update({
    where: { id },
    data: { status: existing.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" },
  });

  await revalidateToursPages();
  return { ok: true, tour: await toTour(row) };
}

export type DeleteTourResult = { ok: true } | { ok: false; error: string };

/**
 * Une Tour n'a pas de relation en base vers Appointment (P2-25 : les arrêts
 * sont calculés à la lecture par correspondance zone/date, pas une clé
 * étrangère) — sa suppression ne touche donc jamais les rendez-vous
 * eux-mêmes, seulement le regroupement en tournée, quel que soit son statut
 * (active, inactive, passée ou à venir).
 */
export async function deleteTourAction(id: string): Promise<DeleteTourResult> {
  const user = await requireUser();
  if (!hasPermission(user, "MANAGE_PUBLIC_SETTINGS")) {
    return { ok: false, error: "Vous n'avez pas la permission de gérer les tournées." };
  }

  const existing = await prisma.tour.findUnique({ where: { id } });
  if (!existing) return { ok: false, error: "Cette tournée n'existe plus." };

  await prisma.tour.delete({ where: { id } });
  await revalidateToursPages();
  return { ok: true };
}

export type ZoneActionResult = { ok: true; zone: Zone } | { ok: false; error: string };

export type SaveZoneInput = { id?: string; name: string; cities: City[] };

export async function saveZoneAction(input: SaveZoneInput): Promise<ZoneActionResult> {
  const user = await requireUser();
  if (!hasPermission(user, "MANAGE_PUBLIC_SETTINGS")) {
    return { ok: false, error: "Vous n'avez pas la permission de gérer les zones." };
  }

  const name = input.name.trim();
  if (!name) return { ok: false, error: "Le nom de la zone est requis." };

  const cities = input.cities
    .map((city) => ({ name: city.name.trim(), postalCode: city.postalCode.trim() }))
    .filter((city) => city.name.length > 0 && city.postalCode.length > 0);
  if (cities.length === 0) return { ok: false, error: "Ajoutez au moins une ville avec son code postal." };

  // Les villes soumises n'ont pas d'id fiable côté client (ids temporaires
  // générés par le formulaire pour React) : on remplace systématiquement
  // tout le jeu de villes de la zone plutôt que de tenter un diff.
  const zone = input.id
    ? await prisma.$transaction(async (tx) => {
        await tx.city.deleteMany({ where: { zoneId: input.id } });
        return tx.zone.update({ where: { id: input.id }, data: { name, cities: { create: cities } }, include: { cities: true } });
      })
    : await prisma.zone.create({ data: { name, cities: { create: cities } }, include: { cities: true } });

  await revalidateToursPages();
  return { ok: true, zone: { id: zone.id, name: zone.name, cities: zone.cities.map((city) => ({ id: city.id, name: city.name, postalCode: city.postalCode })) } };
}

export type DeleteZoneResult = { ok: true } | { ok: false; error: string };

export async function deleteZoneAction(id: string): Promise<DeleteZoneResult> {
  const user = await requireUser();
  if (!hasPermission(user, "MANAGE_PUBLIC_SETTINGS")) {
    return { ok: false, error: "Vous n'avez pas la permission de gérer les zones." };
  }

  try {
    await prisma.zone.delete({ where: { id } });
  } catch {
    // Contrainte de clé étrangère : une Tour référence encore cette zone
    // (Tour.zone n'a pas de cascade de suppression, par conception).
    return { ok: false, error: "Cette zone est utilisée par une tournée et ne peut pas être supprimée." };
  }

  await revalidateToursPages();
  return { ok: true };
}
