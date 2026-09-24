"use server";

import { moduleOpen } from "@/lib/module-access";
import { currentDb } from "@/lib/organization";
import { requireUser } from "@/lib/auth/dal";

export type TourRunOption = {
  id: string;
  name: string;
  /** Nombre d'arrêts déjà placés : « Rouen Nord · 6 arrêts ». */
  stopCount: number;
};

/**
 * Tournées déjà programmées pour cette date.
 *
 * Un rendez-vous n'a pas de mode « tournée » : la base ne connaît que
 * CABINET et DOMICILE. Une tournée est une journée à part (TourRun) à
 * laquelle un rendez-vous à domicile se rattache par un arrêt (TourStop).
 * Le choix « Tournée » du formulaire enregistre donc un rendez-vous à
 * domicile, puis l'ajoute à la tournée choisie via addAppointmentStopsAction
 * — l'action qu'utilise déjà l'écran Tournées, jamais une seconde logique.
 *
 * Renvoie une liste vide quand aucune tournée n'existe ce jour-là : le
 * formulaire le dit alors franchement plutôt que de proposer un choix vide.
 */
export async function listTourRunsForDateAction(dateId: string): Promise<TourRunOption[]> {
  if (!(await moduleOpen("TOURS"))) return [];
  const user = await requireUser();
  const db = await currentDb();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateId)) return [];

  const runs = await db.tourRun.findMany({
    where: { userId: user.id, date: new Date(`${dateId}T00:00:00.000Z`), cancelledAt: null },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, _count: { select: { stops: true } } },
  });

  return runs.map((run) => ({ id: run.id, name: run.name, stopCount: run._count.stops }));
}
