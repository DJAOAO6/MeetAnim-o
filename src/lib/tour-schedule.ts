import { parseDateIdToLocalNoon, toLocalDateId } from "@/lib/booking-validation";
import type { Tour } from "@/data/tours";

const weekdayLabels = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];

export function weekdayLabelFor(date: Date): string {
  return weekdayLabels[date.getDay()];
}

function daysBetweenDateIds(fromDateId: string, toDateId: string): number {
  const from = parseDateIdToLocalNoon(fromDateId);
  const to = parseDateIdToLocalNoon(toDateId);
  return Math.round((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
}

function dayOfMonth(dateId: string): number {
  return Number(dateId.slice(8, 10));
}

/**
 * Détermine si une tournée a lieu à une date donnée : même logique que le
 * tunnel de réservation publique (schedule-step.tsx), réécrite ici de façon
 * indépendante pour ne pas toucher à ce fichier.
 *
 * `dateId` sert d'ancre pour les motifs récurrents (quinzaine/mois — la
 * parité de semaine ou le jour du mois se calculent par rapport à cette
 * première occurrence) et de date exacte pour une tournée ponctuelle. Une
 * tournée hebdomadaire sans ancre (tournées créées avant l'introduction des
 * nouveaux motifs) revient chaque semaine sans condition de date, pour
 * rester rétrocompatible.
 */
export function tourRunsOnDate(tour: Pick<Tour, "day" | "dateId" | "recurrence">, dateId: string, weekday: string): boolean {
  if (tour.recurrence === "Une seule fois") return tour.day === weekday && tour.dateId === dateId;

  // "Tous les mois" s'ancre sur le jour du mois (dateId), pas sur le jour de
  // la semaine : imposer aussi tour.day === weekday ne matcherait presque
  // jamais (le 15 par exemple n'est un mercredi qu'un mois sur sept environ).
  if (tour.recurrence === "Tous les mois") {
    if (!tour.dateId) return false;
    return dateId >= tour.dateId && dayOfMonth(dateId) === dayOfMonth(tour.dateId);
  }

  if (tour.day !== weekday) return false;
  if (!tour.dateId) return true;
  if (dateId < tour.dateId) return false;

  if (tour.recurrence === "Toutes les deux semaines") {
    const weeksSinceAnchor = daysBetweenDateIds(tour.dateId, dateId) / 7;
    return Number.isInteger(weeksSinceAnchor) && weeksSinceAnchor % 2 === 0;
  }
  // "Toutes les semaines" (motif par défaut).
  return true;
}

/**
 * Prochaine date (aujourd'hui inclus) à laquelle une tournée a réellement
 * lieu — utilisé pour calculer ses arrêts réels depuis Appointment
 * (AUDIT_COMPLET.md P2-25) plutôt qu'une table jamais alimentée. Une
 * tournée hebdomadaire revient forcément sous 7 jours ; une quinzaine sous
 * 14 ; une mensuelle est cherchée sur une fenêtre plus large (jusqu'à 31
 * jours) ; une tournée ponctuelle passée n'a plus d'occurrence à venir
 * (null).
 */
export function nextOccurrenceDateId(tour: Pick<Tour, "day" | "dateId" | "recurrence">, todayDateId: string): string | null {
  if (tour.recurrence === "Une seule fois") {
    return tour.dateId && tour.dateId >= todayDateId ? tour.dateId : null;
  }

  const searchWindowDays = tour.recurrence === "Tous les mois" ? 31 : tour.recurrence === "Toutes les deux semaines" ? 14 : 7;
  const today = parseDateIdToLocalNoon(todayDateId);
  for (let offset = 0; offset < searchWindowDays; offset++) {
    const candidate = new Date(today.getTime());
    candidate.setDate(candidate.getDate() + offset);
    const candidateId = toLocalDateId(candidate);
    if (tourRunsOnDate(tour, candidateId, weekdayLabelFor(candidate))) return candidateId;
  }
  return null;
}
