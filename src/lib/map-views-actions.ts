"use server";

import { z } from "zod";
import { currentDb } from "@/lib/organization";
import { requireUser } from "@/lib/auth/dal";
import { requireModule } from "@/lib/module-access";
import { sanitizeMapQuery } from "@/lib/map-modes";
import type { MapViewSummary } from "@/lib/map-views";

// Assez pour ses secteurs et ses habitudes, pas une liste sans fin.
const MAX_VIEWS = 30;

const saveSchema = z.object({ name: z.string().trim().min(1).max(60), query: z.string().max(2000) });

export type SaveMapViewResult = { ok: true; view: MapViewSummary; replaced: boolean } | { ok: false; error: string };

/**
 * « Enregistrer cette vue » : seul le nom est demandé ; l'état vient de
 * l'adresse de la carte, refiltré ici. Un nom déjà pris remplace la vue du
 * même nom (on met à jour « Autour de Caen », on n'en crée pas un double).
 */
export async function saveMapViewAction(input: z.infer<typeof saveSchema>): Promise<SaveMapViewResult> {
  await requireModule("TOURS");
  const user = await requireUser();
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Donnez un nom à la vue (60 caractères au plus)." };
  const { name } = parsed.data;
  const query = sanitizeMapQuery(parsed.data.query);
  const db = await currentDb();

  const existing = await db.mapView.findFirst({ where: { userId: user.id, name }, select: { id: true } });
  if (!existing && (await db.mapView.count({ where: { userId: user.id } })) >= MAX_VIEWS) {
    return { ok: false, error: `Vous avez déjà ${MAX_VIEWS} vues : supprimez-en une avant d’en enregistrer une autre.` };
  }
  const view = existing
    ? await db.mapView.update({ where: { id: existing.id }, data: { query }, select: { id: true, name: true, query: true } })
    : await db.mapView.create({ data: { userId: user.id, name, query }, select: { id: true, name: true, query: true } });
  return { ok: true, view, replaced: Boolean(existing) };
}

export async function deleteMapViewAction(id: string): Promise<{ ok: boolean }> {
  await requireModule("TOURS");
  const user = await requireUser();
  const db = await currentDb();
  // Seulement les vues du compte connecté : l'identifiant vient du navigateur.
  const { count } = await db.mapView.deleteMany({ where: { id, userId: user.id } });
  return { ok: count > 0 };
}
