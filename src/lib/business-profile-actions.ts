"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { hasPermission } from "@/lib/auth/permissions";
import { initialSettings, type AvailabilitySettings, type ProfileSettings } from "@/data/settings";
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
  publicColor: "#4FAF9F",
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
  const data = { ...input, slug };

  try {
    if (existing) {
      await prisma.businessProfile.update({ where: { id: existing.id }, data });
    } else {
      await prisma.businessProfile.create({ data });
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

export async function getAvailability(): Promise<AvailabilitySettings> {
  const row = await prisma.businessProfile.findFirst({ select: { availability: true } });
  if (row?.availability) return row.availability as unknown as AvailabilitySettings;
  return initialSettings.availability;
}

export async function updateAvailabilityAction(input: AvailabilitySettings): Promise<BusinessProfileActionResult> {
  const user = await requireUser();
  if (!hasPermission(user, "MANAGE_PUBLIC_SETTINGS")) {
    return { ok: false, error: "Vous n'avez pas la permission de modifier les disponibilités." };
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
