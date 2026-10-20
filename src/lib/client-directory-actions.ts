"use server";

import { requireUser } from "@/lib/auth/dal";
import { getClientPickerOptions } from "@/lib/clients";
import type { ClientPickerOption } from "@/data/clients";

/**
 * L'annuaire des clients (noms, coordonnées, animaux), demandé par le
 * navigateur au moment où il sert : recherche de l'en-tête, formulaire de
 * rendez-vous. Il partait auparavant avec chaque page de l'espace, même
 * celle des tarifs (audit 2026-10, RGPD-08, ex-PERF-01).
 */
export async function getClientDirectoryAction(): Promise<ClientPickerOption[]> {
  await requireUser();
  return getClientPickerOptions();
}
