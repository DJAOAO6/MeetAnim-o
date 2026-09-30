"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { currentDb } from "@/lib/organization";
import { requireUser } from "@/lib/auth/dal";
import { logAudit } from "@/lib/audit";
import { geocodeClientAddress } from "@/lib/geocoding";
import { animalPlaceKinds, type AnimalPlaceAddress, type AnimalPlaceKind, type AnimalPlaceRef, type SavePlaceInput } from "@/data/places";

const saveSchema = z.object({
  id: z.string().min(1).max(64).optional(),
  name: z.string().trim().min(1).max(100),
  kind: z.enum(animalPlaceKinds as [AnimalPlaceKind, ...AnimalPlaceKind[]]),
  address: z.string().trim().max(300),
  postalCode: z.string().trim().max(10),
  city: z.string().trim().min(1).max(100),
  notes: z.string().max(2000),
});

export type SavePlaceResult = { ok: true; place: AnimalPlaceAddress; located: boolean } | { ok: false; error: string };

function revalidatePlaces() {
  revalidatePath("/dashboard/clients", "layout");
  revalidatePath("/dashboard/carte");
  revalidatePath("/dashboard/tournees");
}

/**
 * Créer ou modifier un lieu. L'adresse est géocodée ici, comme celle d'un
 * client (numéro, rue ou commune — la précision est gardée) ; seulement quand
 * elle change, pour ne pas interroger le géocodeur à chaque correction de
 * nom ou de notes. Une adresse introuvable n'empêche pas d'enregistrer.
 */
export async function savePlaceAction(input: SavePlaceInput): Promise<SavePlaceResult> {
  const user = await requireUser();
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Donnez au moins un nom et une commune au lieu." };
  const data = parsed.data;
  const db = await currentDb();

  const existing = data.id ? await db.animalPlace.findUnique({ where: { id: data.id } }) : null;
  if (data.id && !existing) return { ok: false, error: "Lieu introuvable." };

  // Une adresse nouvelle ou modifiée, ou un lieu pas encore localisé (le
  // géocodeur a pu être indisponible à l'enregistrement précédent).
  const addressChanged = !existing || existing.latitude == null || existing.address !== data.address || existing.city !== data.city || (existing.postalCode ?? "") !== data.postalCode;
  const geocoded = addressChanged ? await geocodeClientAddress({ address: data.address, city: data.city, postalCode: data.postalCode || null }) : null;
  const position = addressChanged
    ? { latitude: geocoded?.latitude ?? null, longitude: geocoded?.longitude ?? null, geocodePrecision: geocoded?.precision ?? null, geocodedAt: new Date() }
    : {};
  const fields = { name: data.name, kind: data.kind, address: data.address, postalCode: data.postalCode || null, city: data.city, notes: data.notes, ...position };

  const place = existing
    ? await db.animalPlace.update({ where: { id: existing.id }, data: fields })
    : await db.animalPlace.create({ data: fields });
  await logAudit({ userId: user.id, action: "PLACE_UPDATED", entityType: "AnimalPlace", entityId: place.id, metadata: { created: !existing } });
  revalidatePlaces();

  return {
    ok: true,
    located: place.latitude != null && place.longitude != null,
    place: {
      id: place.id,
      name: place.name,
      kind: place.kind as AnimalPlaceKind,
      city: place.city,
      address: place.address,
      postalCode: place.postalCode ?? "",
      latitude: place.latitude,
      longitude: place.longitude,
    },
  };
}

/** Lieux de l'espace, pour le choix « Où vit-il ? » d'une fiche animal. */
export async function listPlacesAction(): Promise<AnimalPlaceRef[]> {
  await requireUser();
  const db = await currentDb();
  const places = await db.animalPlace.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, kind: true, city: true } });
  return places.map((place) => ({ ...place, kind: place.kind as AnimalPlaceKind }));
}

/** Supprimer un lieu : ses animaux redeviennent « chez leur propriétaire ». */
export async function deletePlaceAction(id: string): Promise<{ ok: true; animalCount: number } | { ok: false; error: string }> {
  const user = await requireUser();
  const db = await currentDb();
  const place = await db.animalPlace.findUnique({ where: { id }, select: { id: true, _count: { select: { animals: true } } } });
  if (!place) return { ok: false, error: "Lieu introuvable." };
  await db.animalPlace.delete({ where: { id } });
  await logAudit({ userId: user.id, action: "PLACE_DELETED", entityType: "AnimalPlace", entityId: id, metadata: { animalCount: place._count.animals } });
  revalidatePlaces();
  return { ok: true, animalCount: place._count.animals };
}
