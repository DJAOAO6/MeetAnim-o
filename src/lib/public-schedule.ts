"use server";

import { getAvailability } from "@/lib/business-profile-actions";
import { getDayAvailability } from "@/lib/availability";
import type { BookingDate } from "@/data/public-booking";
import {
  BOOKING_WINDOW_DAYS,
  formatBookingDateLabels,
  generateCandidateStarts,
  parseDateIdToLocalNoon,
  PRACTITIONER_TIME_ZONE,
  toLocalDateId,
  todayIdInTimeZone,
} from "@/lib/booking-validation";

/**
 * Premier jour de la fenêtre de réservation (demain, au fuseau du
 * praticien), sous forme d'identifiant YYYY-MM-DD.
 */
export async function getBookingWindowStartId(): Promise<string> {
  const todayId = todayIdInTimeZone(PRACTITIONER_TIME_ZONE);
  const tomorrow = parseDateIdToLocalNoon(todayId);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return toLocalDateId(tomorrow);
}

export type PublicSchedule = {
  dates: BookingDate[];
  // Bornes de la fenêtre de réservation ("YYYY-MM-DD") : le calendrier
  // (CalendarMonth) en a besoin pour désactiver la navigation mois
  // précédent/suivant une fois sorti de la fenêtre, y compris pour un mois
  // qui n'a aucune date avec créneaux (donc absent de `dates`) mais reste
  // partiellement dans la fenêtre.
  windowStartId: string;
  windowEndId: string;
};

/**
 * Génère les dates et créneaux réellement réservables pour un mode et une
 * durée de prestation donnés, à partir des vraies disponibilités du
 * praticien (horaires habituels, vacances, fermetures exceptionnelles —
 * src/lib/availability.ts, alimentée par le profil métier en base). Une
 * date n'apparaît que si au moins un horaire de départ permet à la
 * prestation entière de tenir dans une plage ouverte pour ce mode.
 */
export async function getPublicScheduleAction(mode: "cabinet" | "home", durationMinutes: number): Promise<PublicSchedule> {
  const availability = await getAvailability();
  const startId = await getBookingWindowStartId();
  const cursor = parseDateIdToLocalNoon(startId);

  const dates: BookingDate[] = [];
  for (let offset = 0; offset < BOOKING_WINDOW_DAYS; offset++) {
    const { open, hourly } = getDayAvailability(cursor, availability);
    if (open) {
      const slots = generateCandidateStarts(hourly, mode, durationMinutes, availability.slotInterval);
      if (slots.length > 0) {
        const dateId = toLocalDateId(cursor);
        dates.push({ id: dateId, ...formatBookingDateLabels(dateId), slots });
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  const windowEnd = parseDateIdToLocalNoon(startId);
  windowEnd.setDate(windowEnd.getDate() + BOOKING_WINDOW_DAYS - 1);

  return { dates, windowStartId: startId, windowEndId: toLocalDateId(windowEnd) };
}
