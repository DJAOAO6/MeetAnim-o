"use server";

import { revalidatePath } from "next/cache";
import { currentDb } from "@/lib/organization";
import { requireUser } from "@/lib/auth/dal";
import { getBusinessProfile } from "@/lib/business-profile-actions";
import type { Prisma } from "@/generated/prisma/client";
import { DEFAULT_MARKER_PRESETS, type MarkerPreset } from "@/lib/documents/marker-presets";

export async function getMarkerPresets(): Promise<MarkerPreset[]> {
  await requireUser();
  const db = await currentDb();
  const row = await db.businessProfile.findFirst({ select: { markerPresets: true } });
  if (!row?.markerPresets) return DEFAULT_MARKER_PRESETS;
  return row.markerPresets as unknown as MarkerPreset[];
}

export type UpdateMarkerPresetsResult = { ok: true } | { ok: false; error: string };

/**
 * Renommer un repère ne change jamais son id/couleur (uniquement le libellé
 * affiché dans le sélecteur et sur les prochains repères posés) — les
 * repères déjà posés sur des documents existants gardent le libellé qu'ils
 * avaient au moment de la pose (DiagramMarker.label est dupliqué à la pose,
 * voir editor-toolbar.tsx / canvas-stage.tsx), jamais rétroactivement modifié.
 */
export async function updateMarkerPresetsAction(presets: MarkerPreset[]): Promise<UpdateMarkerPresetsResult> {
  await requireUser();
  const db = await currentDb();
  const profile = await getBusinessProfile();
  const existing = await db.businessProfile.findFirst({ where: { slug: profile.slug }, select: { id: true } });
  if (!existing) return { ok: false, error: "Profil professionnel introuvable." };

  await db.businessProfile.update({
    where: { id: existing.id },
    data: { markerPresets: presets as unknown as Prisma.InputJsonValue },
  });

  revalidatePath("/dashboard/documents");
  return { ok: true };
}
