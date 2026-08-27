"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { hasPermission } from "@/lib/auth/permissions";
import { initialSettings, type AnimalType, type ServiceSettings, type TravelFeeMode } from "@/data/settings";
import type { PublicAnimalType, PublicService } from "@/data/public-booking";
import type { Prisma, TravelFeeMode as DbTravelFeeMode } from "@/generated/prisma/client";

const dbTravelFeeMode: Record<TravelFeeMode, DbTravelFeeMode> = { fixed: "FIXED", zone: "ZONE", kilometric: "KILOMETRIC" };
const travelFeeModeLabel: Record<DbTravelFeeMode, TravelFeeMode> = { FIXED: "fixed", ZONE: "zone", KILOMETRIC: "kilometric" };

type ServiceRow = {
  id: string;
  name: string;
  description: string;
  duration: number;
  animals: string[];
  cabinetEnabled: boolean;
  cabinetPrice: number;
  homeEnabled: boolean;
  homePrice: number;
  travelFeesEnabled: boolean;
  travelFeeMode: DbTravelFeeMode;
  fixedTravelFee: number;
  zoneFees: Prisma.JsonValue;
  kilometricRate: number;
  suggestedReminder: string;
  active: boolean;
  photoUrl: string | null;
};

function toServiceSettings(row: ServiceRow): ServiceSettings {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    duration: row.duration,
    animals: row.animals as AnimalType[],
    cabinetEnabled: row.cabinetEnabled,
    cabinetPrice: row.cabinetPrice,
    homeEnabled: row.homeEnabled,
    homePrice: row.homePrice,
    travelFeesEnabled: row.travelFeesEnabled,
    travelFeeMode: travelFeeModeLabel[row.travelFeeMode],
    fixedTravelFee: row.fixedTravelFee,
    zoneFees: (row.zoneFees as Record<string, number> | null) ?? {},
    kilometricRate: row.kilometricRate,
    suggestedReminder: row.suggestedReminder as ServiceSettings["suggestedReminder"],
    active: row.active,
    photoUrl: row.photoUrl,
  };
}

function toServiceData(service: Omit<ServiceSettings, "id">) {
  return {
    name: service.name,
    description: service.description,
    duration: service.duration,
    animals: service.animals,
    cabinetEnabled: service.cabinetEnabled,
    cabinetPrice: service.cabinetPrice,
    homeEnabled: service.homeEnabled,
    homePrice: service.homePrice,
    travelFeesEnabled: service.travelFeesEnabled,
    travelFeeMode: dbTravelFeeMode[service.travelFeeMode],
    fixedTravelFee: service.fixedTravelFee,
    zoneFees: service.zoneFees as Prisma.InputJsonValue,
    kilometricRate: service.kilometricRate,
    suggestedReminder: service.suggestedReminder,
    active: service.active,
    photoUrl: service.photoUrl,
  };
}

/**
 * Les prestations démo (initialSettings.services) servent d'amorçage : la
 * toute première lecture peuple la table si elle est vide, exactement comme
 * getBusinessProfile() le fait pour BusinessProfile. Les ids réels sont
 * générés par Prisma (cuid) plutôt que de réutiliser les ids de démo.
 */
export async function getServices(): Promise<ServiceSettings[]> {
  const rows = await prisma.service.findMany({ orderBy: { createdAt: "asc" } });
  if (rows.length > 0) return rows.map(toServiceSettings);

  for (const service of initialSettings.services) {
    await prisma.service.create({ data: toServiceData(service) });
  }

  const seeded = await prisma.service.findMany({ orderBy: { createdAt: "asc" } });
  return seeded.map(toServiceSettings);
}

/**
 * Vue publique (page de réservation) : uniquement les prestations actives,
 * mise en forme adaptée au flux de réservation (espèces, tarifs, photo). Le
 * mode "kilometric" n'a pas d'équivalent dans le flux public (aucune distance
 * n'y est calculée automatiquement) : il est présenté comme "aucun frais"
 * plutôt que d'afficher un montant erroné.
 */
export async function getPublicServices(): Promise<PublicService[]> {
  const services = await getServices();
  return services.filter((service) => service.active).map(toPublicService);
}

function toPublicService(service: ServiceSettings): PublicService {
  const feeMode = !service.travelFeesEnabled || service.travelFeeMode === "kilometric" ? "none" : service.travelFeeMode;
  return {
    id: service.id,
    name: service.name,
    description: service.description,
    duration: service.duration,
    animalTypes: service.animals as PublicAnimalType[],
    cabinetEnabled: service.cabinetEnabled,
    cabinetPrice: service.cabinetPrice,
    homeEnabled: service.homeEnabled,
    homePrice: service.homePrice,
    travelFeeMode: feeMode,
    fixedTravelFee: feeMode === "fixed" ? service.fixedTravelFee : 0,
    photoUrl: service.photoUrl ?? undefined,
  };
}

async function revalidateServicePages() {
  revalidatePath("/dashboard/prestations");
  revalidatePath("/dashboard/parametres");
  const profile = await prisma.businessProfile.findFirst({ select: { slug: true } });
  if (profile) revalidatePath(`/reserver/${profile.slug}`);
}

export type ServiceActionResult = { ok: true; service: ServiceSettings } | { ok: false; error: string };

export async function saveServiceAction(input: ServiceSettings): Promise<ServiceActionResult> {
  const user = await requireUser();
  if (!hasPermission(user, "MANAGE_PUBLIC_SETTINGS")) {
    return { ok: false, error: "Vous n'avez pas la permission de modifier les prestations." };
  }

  const name = input.name.trim();
  if (!name) return { ok: false, error: "Le nom de la prestation est requis." };
  if (!input.cabinetEnabled && !input.homeEnabled) return { ok: false, error: "Activez au moins un mode de consultation." };
  if (input.animals.length === 0) return { ok: false, error: "Sélectionnez au moins une espèce." };

  const data = toServiceData({ ...input, name });
  const existing = input.id ? await prisma.service.findUnique({ where: { id: input.id } }) : null;
  const row = existing
    ? await prisma.service.update({ where: { id: input.id }, data })
    : await prisma.service.create({ data });

  await revalidateServicePages();

  return { ok: true, service: toServiceSettings(row) };
}

export type DeleteServiceResult = { ok: true } | { ok: false; error: string };

export async function deleteServiceAction(id: string): Promise<DeleteServiceResult> {
  const user = await requireUser();
  if (!hasPermission(user, "MANAGE_PUBLIC_SETTINGS")) {
    return { ok: false, error: "Vous n'avez pas la permission de supprimer une prestation." };
  }

  await prisma.service.delete({ where: { id } });
  await revalidateServicePages();

  return { ok: true };
}
