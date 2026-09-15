"use server";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import {
  DEFAULT_DASHBOARD_LAYOUT,
  normalizeDashboardLayout,
  type DashboardWidgetPreference,
} from "@/data/dashboard-widgets";

/**
 * Disposition du tableau de bord de l'utilisateur connecté. Rien en base =
 * disposition par défaut : aucune écriture n'est faite tant que la personne
 * n'a rien personnalisé, un compte neuf ne crée donc pas de ligne inutile.
 */
export async function getDashboardLayout(): Promise<DashboardWidgetPreference[]> {
  const user = await requireUser();
  const row = await prisma.dashboardPreferences.findUnique({ where: { userId: user.id }, select: { widgets: true } });
  if (!row) return DEFAULT_DASHBOARD_LAYOUT;
  return normalizeDashboardLayout(row.widgets);
}

export type SaveDashboardLayoutResult = { ok: true; layout: DashboardWidgetPreference[] } | { ok: false; error: string };

/**
 * La disposition reçue vient du navigateur : elle est renormalisée côté
 * serveur (blocs inconnus écartés, largeurs ramenées dans les bornes) avant
 * écriture, jamais enregistrée telle quelle.
 *
 * Pas de revalidatePath : la page n'a pas besoin d'être refabriquée, l'écran
 * affiche déjà la disposition que l'utilisateur vient de composer. Une
 * revalidation ferait clignoter tout le tableau de bord à chaque
 * enregistrement.
 */
export async function saveDashboardLayoutAction(layout: DashboardWidgetPreference[]): Promise<SaveDashboardLayoutResult> {
  const user = await requireUser();
  const normalized = normalizeDashboardLayout(layout);

  try {
    await prisma.dashboardPreferences.upsert({
      where: { userId: user.id },
      create: { userId: user.id, widgets: normalized },
      update: { widgets: normalized },
    });
  } catch (error) {
    console.error("[dashboard] Échec de l'enregistrement de la disposition", error);
    return { ok: false, error: "La disposition n'a pas pu être enregistrée. Réessayez dans un instant." };
  }

  return { ok: true, layout: normalized };
}

/** Remet la disposition d'origine : la ligne est supprimée plutôt que réécrite. */
export async function resetDashboardLayoutAction(): Promise<SaveDashboardLayoutResult> {
  const user = await requireUser();
  try {
    await prisma.dashboardPreferences.deleteMany({ where: { userId: user.id } });
  } catch (error) {
    console.error("[dashboard] Échec de la réinitialisation de la disposition", error);
    return { ok: false, error: "La disposition n'a pas pu être réinitialisée. Réessayez dans un instant." };
  }
  return { ok: true, layout: DEFAULT_DASHBOARD_LAYOUT };
}
