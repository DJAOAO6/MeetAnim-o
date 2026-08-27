import type { Tour } from "@/data/tours";

const weekdayLabels = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];

export function weekdayLabelFor(date: Date): string {
  return weekdayLabels[date.getDay()];
}

/**
 * Détermine si une tournée a lieu à une date donnée : même logique que le
 * tunnel de réservation publique (schedule-step.tsx), réécrite ici de façon
 * indépendante pour ne pas toucher à ce fichier.
 */
export function tourRunsOnDate(tour: Pick<Tour, "day" | "dateId" | "recurrence">, dateId: string, weekday: string): boolean {
  if (tour.day !== weekday) return false;
  if (!tour.dateId) return true;
  if (tour.recurrence === "Une seule fois") return tour.dateId === dateId;
  return dateId >= tour.dateId;
}
