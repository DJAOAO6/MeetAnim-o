"use server";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { DEFAULT_AGENDA_DISPLAY, normalizeAgendaDisplay, type AgendaDisplay } from "@/lib/agenda-display";

/**
 * Affichage de l'agenda du compte connecté — et de lui seul : l'identifiant
 * vient de la session, jamais du navigateur. Rien en base = valeurs par
 * défaut, sans créer de ligne.
 */
export async function getAgendaDisplay(): Promise<AgendaDisplay> {
  const user = await requireUser();
  const row = await prisma.agendaPreferences.findUnique({ where: { userId: user.id } });
  return row ? normalizeAgendaDisplay(row) : DEFAULT_AGENDA_DISPLAY;
}

export type SaveAgendaDisplayResult = { ok: true; display: AgendaDisplay } | { ok: false; error: string };

/**
 * « Définir comme affichage par défaut ». Ce qui arrive du navigateur est
 * revalidé ici (valeurs admises, plage horaire dans le bon sens) avant
 * d'être écrit, jamais enregistré tel quel.
 */
export async function saveAgendaDisplayAction(input: AgendaDisplay): Promise<SaveAgendaDisplayResult> {
  const user = await requireUser();
  const display = normalizeAgendaDisplay(input);
  if (input.dayStart >= input.dayEnd) return { ok: false, error: "L’heure de fin doit suivre l’heure de début." };
  try {
    await prisma.agendaPreferences.upsert({ where: { userId: user.id }, create: { userId: user.id, ...display }, update: display });
  } catch (error) {
    console.error("[agenda] Échec de l'enregistrement de l'affichage", error);
    return { ok: false, error: "L’affichage n’a pas pu être enregistré. Réessayez dans un instant." };
  }
  return { ok: true, display };
}
