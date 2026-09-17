import { findMatchingZone, intervalsOverlap, timeToMinutes } from "@/lib/booking-validation";
import type { PublicZone } from "@/data/public-booking";

/**
 * Règles décidant quels créneaux d'un passage de tournée peuvent être
 * proposés à un visiteur.
 *
 * Volontairement sans base ni React : ce sont ces règles qui peuvent faire
 * promettre publiquement un créneau impossible, et ce sont donc elles qu'il
 * faut pouvoir vérifier sans lancer l'application. Le fichier appelant
 * (tour-suggestions.ts) ne fait que lire les données et les leur donner.
 */

/** Rendez-vous déjà posé ce jour-là, tel qu'il occupe la journée. */
export type BookedSlot = {
  /** Minutes depuis minuit. */
  start: number;
  /** Fin réelle : durée + temps de trajet pour une visite à domicile. */
  end: number;
  home: boolean;
  postalCode?: string;
  city?: string;
};

export type TourWindow = {
  /** Horaires du passage, « 09:00 » / « 12:30 ». */
  startTime: string;
  endTime: string;
  /** Limite douce côté professionnel ; absente = pas de limite. */
  maxStops: number | null;
  zones: PublicZone[];
};

/**
 * Arrêts que cette tournée compte déjà ce jour-là.
 *
 * Seules comptent les visites à domicile **de son secteur** : un rendez-vous
 * à domicile dans une autre zone le même jour n'est pas l'un de ses arrêts,
 * et le compter fermerait la tournée pour rien.
 */
export function countTourStops(booked: BookedSlot[], zones: PublicZone[]): number {
  return booked.filter((slot) => slot.home && findMatchingZone(zones, slot.postalCode, slot.city) !== undefined).length;
}

export function isTourFull(booked: BookedSlot[], tour: TourWindow): boolean {
  if (tour.maxStops == null) return false;
  return countTourStops(booked, tour.zones) >= tour.maxStops;
}

/**
 * Créneaux proposables parmi ceux que le calendrier normal offrirait déjà.
 *
 * `candidates` vient de generateCandidateStarts : ce sont les horaires qui
 * tiennent dans les vraies disponibilités du praticien pour cette durée. On
 * n'en garde que ceux qui tombent **pendant** le passage de la tournée et qui
 * ne chevauchent rien. Un créneau proposé est donc exactement aussi
 * réservable qu'un créneau choisi dans le calendrier — le serveur le
 * revérifie de toute façon à la soumission.
 */
export function selectTourSlots({ candidates, tour, durationMinutes, booked, limit }: {
  candidates: string[];
  tour: TourWindow;
  durationMinutes: number;
  booked: BookedSlot[];
  limit: number;
}): string[] {
  if (isTourFull(booked, tour)) return [];

  const windowStart = timeToMinutes(tour.startTime);
  const windowEnd = timeToMinutes(tour.endTime);

  return candidates
    .filter((slot) => {
      const start = timeToMinutes(slot);
      // La prestation entière doit tenir dans le passage : commencer dix
      // minutes avant la fin de la tournée n'aurait pas de sens.
      return start >= windowStart && start + durationMinutes <= windowEnd;
    })
    .filter((slot) => {
      const start = timeToMinutes(slot);
      return !booked.some((item) => intervalsOverlap(start, durationMinutes, item.start, item.end - item.start));
    })
    .slice(0, limit);
}
