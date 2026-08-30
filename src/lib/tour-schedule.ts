import { parseDateIdToLocalNoon, toLocalDateId } from "@/lib/booking-validation";
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

/**
 * Prochaine date (aujourd'hui inclus) à laquelle une tournée a réellement
 * lieu — utilisé pour calculer ses arrêts réels depuis Appointment
 * (AUDIT_COMPLET.md P2-25) plutôt qu'une table jamais alimentée. Une
 * tournée hebdomadaire revient forcément sous 7 jours ; une tournée
 * ponctuelle passée n'a plus d'occurrence à venir (null).
 */
export function nextOccurrenceDateId(tour: Pick<Tour, "day" | "dateId" | "recurrence">, todayDateId: string): string | null {
  if (tour.recurrence === "Une seule fois") {
    return tour.dateId && tour.dateId >= todayDateId ? tour.dateId : null;
  }

  const today = parseDateIdToLocalNoon(todayDateId);
  for (let offset = 0; offset < 7; offset++) {
    const candidate = new Date(today.getTime());
    candidate.setDate(candidate.getDate() + offset);
    const candidateId = toLocalDateId(candidate);
    if (tourRunsOnDate(tour, candidateId, weekdayLabelFor(candidate))) return candidateId;
  }
  return null;
}
