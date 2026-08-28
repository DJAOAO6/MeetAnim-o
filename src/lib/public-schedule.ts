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

/**
 * Génère les dates et créneaux réellement réservables pour un mode et une
 * durée de prestation donnés, à partir des vraies disponibilités du
 * praticien (horaires habituels, vacances, fermetures exceptionnelles —
 * src/lib/availability.ts, alimentée par le profil métier en base). Une
 * date n'apparaît que si au moins un horaire de départ permet à la
 * prestation entière de tenir dans une plage ouverte pour ce mode.
 */
export async function getPublicScheduleAction(mode: "cabinet" | "home", durationMinutes: number): Promise<BookingDate[]> {
  const availability = await getAvailability();
  const startId = await getBookingWindowStartId();
  const cursor = parseDateIdToLocalNoon(startId);

  const dates: BookingDate[] = [];
  for (let offset = 0; offset < BOOKING_WINDOW_DAYS; offset++) {
    const { open, hourly } = getDayAvailability(cursor, availability);
    if (open) {
      const slots = generateCandidateStarts(hourly, mode, durationMinutes);
      if (slots.length > 0) {
        const dateId = toLocalDateId(cursor);
        dates.push({ id: dateId, ...formatBookingDateLabels(dateId), slots });
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}
