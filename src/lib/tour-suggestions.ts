"use server";

import { dbForSlug, moduleOpenFor } from "@/lib/organization";
import { getAvailability } from "@/lib/business-profile-actions";
import { getDayAvailability } from "@/lib/availability";
import { getBookingWindowStartId } from "@/lib/public-schedule";
import { tourRunsOnDate, weekdayLabelFor } from "@/lib/tour-schedule";
import {
  BOOKING_WINDOW_DAYS,
  formatBookingDateLabels,
  generateCandidateStarts,
  parseDateIdToLocalNoon,
  timeToMinutes,
  toLocalDateId,
} from "@/lib/booking-validation";
import { selectTourSlots, type BookedSlot } from "@/lib/tour-suggestion-rules";
import type { Tour } from "@/data/tours";

const MAX_TOURS = 4;
/** Dates proposées par tournée, et créneaux par date : de quoi choisir, pas de quoi se perdre. */
const MAX_DATES_PER_TOUR = 2;
const MAX_SLOTS_PER_DATE = 3;

export type TourSuggestionDate = {
  dateId: string;
  /** « Mardi 22 septembre 2025 », déjà formaté côté serveur. */
  label: string;
  slots: string[];
};

/**
 * Ce qu'un visiteur public a le droit de savoir d'une tournée : son nom, son
 * secteur, et quand il reste de la place. Jamais les clients déjà inscrits,
 * ni l'itinéraire, ni les coordonnées du professionnel (§18).
 */
export type TourSuggestion = {
  tourId: string;
  tourName: string;
  /** « Rouen, Mont-Saint-Aignan, Bois-Guillaume… » — les villes du secteur. */
  areaLabel: string;
  dates: TourSuggestionDate[];
};

export type TourSuggestionInput = {
  /** Zone déduite de l'adresse par findMatchingZone, côté client. */
  zoneId: string;
  durationMinutes: number;
};

/**
 * Passages de tournée proposés pour l'adresse d'un visiteur.
 *
 * Le principe tient en une phrase : si le professionnel sera déjà dans le
 * secteur du client un jour donné, ce jour-là est un meilleur créneau que les
 * autres — pour lui comme pour le client.
 *
 * Un point important sur le rattachement : rien n'est à enregistrer. Un
 * rendez-vous à domicile appartient à une tournée dès lors qu'il tombe le jour
 * de son passage et que son code postal ou sa ville relève de l'une de ses
 * zones (voir computeTourOccurrence dans tours.ts). Réserver un créneau
 * proposé ici suffit donc à faire apparaître le rendez-vous dans la tournée,
 * son itinéraire et l'agenda — sans colonne de liaison, qui deviendrait une
 * seconde vérité capable de contredire la première.
 *
 * Les créneaux rendus sont exactement ceux que le calendrier normal
 * proposerait : mêmes disponibilités, même pas de temps, mêmes créneaux
 * occupés. Un créneau suggéré est donc réellement réservable, et le serveur
 * le revérifie de toute façon à la soumission.
 */
export async function getSuggestedToursForAddressAction(slug: string, input: TourSuggestionInput): Promise<TourSuggestion[]> {
  // Appelée depuis la page publique : le cabinet vient du lien suivi.
  const db = await dbForSlug(slug);
  if (!db) return [];
  // Sans le module Tournées, aucune proposition de tournée aux visiteurs.
  if (!(await moduleOpenFor(db, "TOURS"))) return [];
  const duration = Math.round(input.durationMinutes);
  if (!input.zoneId || !Number.isFinite(duration) || duration <= 0) return [];

  const [tours, availability, windowStartId] = await Promise.all([
    db.tour.findMany({
      where: {
        status: "ACTIVE",
        // Multi-zone : la zone peut être rattachée par la relation moderne
        // (`zones`) ou par la colonne historique — les deux comptent, comme
        // dans le calcul des arrêts d'une tournée.
        OR: [{ zones: { some: { id: input.zoneId } } }, { zoneId: input.zoneId }],
      },
      select: {
        id: true, name: true, day: true, dateId: true, recurrence: true,
        startTime: true, endTime: true, maxStops: true,
        zones: { select: { id: true, name: true, cities: { select: { name: true, postalCode: true } } } },
        zone: { select: { id: true, name: true, cities: { select: { name: true, postalCode: true } } } },
      },
    }),
    getAvailability(),
    getBookingWindowStartId(),
  ]);

  if (tours.length === 0) return [];

  // Une seule lecture des rendez-vous de la fenêtre, partagée par toutes les
  // tournées : ce sont eux qui disent quels créneaux sont pris et combien
  // d'arrêts une tournée compte déjà.
  const windowEnd = parseDateIdToLocalNoon(windowStartId);
  windowEnd.setDate(windowEnd.getDate() + BOOKING_WINDOW_DAYS - 1);
  const booked = await db.appointment.findMany({
    where: {
      status: { not: "CANCELLED" },
      date: { gte: new Date(`${windowStartId}T00:00:00.000Z`), lte: new Date(`${toLocalDateId(windowEnd)}T23:59:59.999Z`) },
    },
    select: { date: true, start: true, duration: true, mode: true, postalCode: true, city: true },
  });

  const bookedByDate = new Map<string, BookedSlot[]>();
  for (const appointment of booked) {
    const dateId = appointment.date.toISOString().slice(0, 10);
    const start = timeToMinutes(appointment.start);
    // Même règle que hasConflict : une visite à domicile occupe sa durée plus
    // le temps de trajet configuré.
    const occupied = appointment.mode === "DOMICILE" ? appointment.duration + availability.travelBuffer : appointment.duration;
    const entry = bookedByDate.get(dateId) ?? [];
    entry.push({
      start,
      end: start + occupied,
      home: appointment.mode === "DOMICILE",
      postalCode: appointment.postalCode ?? undefined,
      city: appointment.city ?? undefined,
    });
    bookedByDate.set(dateId, entry);
  }

  const suggestions: TourSuggestion[] = [];

  for (const tour of tours) {
    // Zones de la tournée, à la forme attendue par findMatchingZone : le même
    // rattachement adresse → zone que celui des frais de déplacement et du
    // calcul des arrêts, jamais une seconde règle.
    const tourZones = (tour.zones.length > 0 ? tour.zones : [tour.zone]).map((zone) => ({
      id: zone.id,
      name: zone.name,
      cities: zone.cities.map((city) => city.name),
      postalCodes: zone.cities.map((city) => city.postalCode),
      tourDays: [],
    }));

    const tourWindow = { startTime: tour.startTime, endTime: tour.endTime, maxStops: tour.maxStops, zones: tourZones };
    const dates: TourSuggestionDate[] = [];
    const cursor = parseDateIdToLocalNoon(windowStartId);

    for (let offset = 0; offset < BOOKING_WINDOW_DAYS && dates.length < MAX_DATES_PER_TOUR; offset += 1) {
      const dateId = toLocalDateId(cursor);
      const runsToday = tourRunsOnDate(
        { day: tour.day, dateId: tour.dateId ?? undefined, recurrence: tour.recurrence as Tour["recurrence"] },
        dateId,
        weekdayLabelFor(cursor),
      );

      if (runsToday) {
        const { open, hourly } = getDayAvailability(cursor, availability);
        if (open) {
          const slots = selectTourSlots({
            candidates: generateCandidateStarts(hourly, "home", duration, availability.slotInterval),
            tour: tourWindow,
            durationMinutes: duration,
            booked: bookedByDate.get(dateId) ?? [],
            limit: MAX_SLOTS_PER_DATE,
          });
          if (slots.length > 0) dates.push({ dateId, label: formatBookingDateLabels(dateId).fullLabel, slots });
        }
      }

      cursor.setDate(cursor.getDate() + 1);
    }

    if (dates.length > 0) {
      suggestions.push({
        tourId: tour.id,
        tourName: tour.name,
        areaLabel: [...new Set(tourZones.flatMap((zone) => zone.cities))].slice(0, 3).join(", "),
        dates,
      });
    }
  }

  // Le passage le plus proche d'abord : c'est celui qui intéresse.
  return suggestions
    .sort((first, second) => first.dates[0].dateId.localeCompare(second.dates[0].dateId))
    .slice(0, MAX_TOURS);
}
