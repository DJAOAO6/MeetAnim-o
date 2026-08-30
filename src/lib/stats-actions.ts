"use server";

import { getStatsData } from "@/lib/stats";
import { requireUser } from "@/lib/auth/dal";
import { hasPermission } from "@/lib/auth/permissions";
import type { StatsData, StatsFilters } from "@/data/stats";

/**
 * StatisticsPage vérifie déjà VIEW_FINANCES côté page, mais une server
 * action est un point d'entrée réseau à part entière (référence appelable
 * directement) — revérifie la permission ici, pas seulement au rendu de la
 * page qui l'appelle.
 */
export async function getStatsAction(filters: StatsFilters): Promise<StatsData | null> {
  const user = await requireUser();
  if (!hasPermission(user, "VIEW_FINANCES")) return null;
  return getStatsData(filters);
}
