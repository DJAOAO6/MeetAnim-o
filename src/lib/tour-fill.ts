import "server-only";
import { prisma } from "@/lib/db";
import { getAvailability } from "@/lib/business-profile-actions";
import { getDayAvailability } from "@/lib/availability";
import {
  findMatchingZone,
  formatBookingDateLabels,
  generateCandidateStarts,
  intervalsOverlap,
  parseDateIdToLocalNoon,
  timeToMinutes,
  toLocalDateId,
} from "@/lib/booking-validation";
import { nextOccurrenceDateId } from "@/lib/tour-schedule";
import { getZones } from "@/lib/tours";
import type { Tour } from "@/data/tours";
import type { PublicZone } from "@/data/public-booking";
import type { Tour as DbTour } from "@/generated/prisma/client";

// Un rappel "proche de l'échéance" (pas encore DUE) dans cette fenêtre
// compte aussi : ça reste une occasion pertinente de le proposer pendant que
// la tournée passe déjà dans le secteur, pas seulement les rappels déjà en
// retard.
const NEAR_DUE_WINDOW_DAYS = 30;

export type TourFillOpportunity = {
  zoneName: string;
  dateLabel: string;
  reminderIds: string[];
  freeSlotCount: number;
};

/**
 * Créneaux encore libres, à la prochaine occurrence de la tournée, dans sa
 * propre fenêtre horaire [startTime, endTime) — recalculés à partir des
 * disponibilités réelles (comme le tunnel de réservation publique) plutôt
 * que d'une capacité théorique, puis exclut ceux déjà occupés par un
 * rendez-vous ce jour-là (tous modes confondus, avec la même marge de
 * trajet que la détection de conflit côté réservation publique).
 */
async function countFreeSlotsInTourWindow(tour: DbTour, dateId: string): Promise<number> {
  const availability = await getAvailability();
  const { hourly } = getDayAvailability(parseDateIdToLocalNoon(dateId), availability);
  const duration = availability.defaultAppointmentDuration;
  const candidates = generateCandidateStarts(hourly, "home", duration, availability.slotInterval);

  const tourStartMinutes = timeToMinutes(tour.startTime);
  const tourEndMinutes = timeToMinutes(tour.endTime);
  const withinWindow = candidates.filter((start) => {
    const startMinutes = timeToMinutes(start);
    return startMinutes >= tourStartMinutes && startMinutes + duration <= tourEndMinutes;
  });
  if (withinWindow.length === 0) return 0;

  const sameDayAppointments = await prisma.appointment.findMany({
    where: { date: new Date(`${dateId}T00:00:00.000Z`), status: { not: "CANCELLED" } },
    select: { start: true, duration: true, mode: true },
  });

  return withinWindow.filter((start) => {
    const startMinutes = timeToMinutes(start);
    return !sameDayAppointments.some((appointment) => {
      const bufferedDuration = appointment.mode === "DOMICILE" ? appointment.duration + availability.travelBuffer : appointment.duration;
      return intervalsOverlap(startMinutes, duration, timeToMinutes(appointment.start), bufferedDuration);
    });
  }).length;
}

async function computeTourFillOpportunity(tour: DbTour, publicZones: PublicZone[], todayId: string): Promise<TourFillOpportunity | null> {
  const zone = publicZones.find((z) => z.id === tour.zoneId);
  if (!zone) return null;

  const dateId = nextOccurrenceDateId({ day: tour.day, dateId: tour.dateId ?? undefined, recurrence: tour.recurrence as Tour["recurrence"] }, todayId);
  if (!dateId) return null;

  const nearDueLimit = new Date();
  nearDueLimit.setDate(nearDueLimit.getDate() + NEAR_DUE_WINDOW_DAYS);
  const reminders = await prisma.reminder.findMany({
    where: { status: { in: ["DUE", "UPCOMING"] }, dueDate: { lte: nearDueLimit } },
    select: { id: true, client: { select: { city: true } } },
  });
  const zoneReminderIds = reminders
    .filter((reminder) => findMatchingZone(publicZones, undefined, reminder.client.city)?.id === zone.id)
    .map((reminder) => reminder.id);
  if (zoneReminderIds.length === 0) return null;

  const freeSlotCount = await countFreeSlotsInTourWindow(tour, dateId);

  return { zoneName: zone.name, dateLabel: formatBookingDateLabels(dateId).weekday, reminderIds: zoneReminderIds, freeSlotCount };
}

/**
 * Occasions de remplir une tournée (refonte tournées, phase 3.1) : pour
 * chaque tournée dont la zone contient au moins un rappel dû ou proche de
 * l'échéance, le nombre de créneaux encore libres à sa prochaine occurrence.
 * Calculée pour toutes les tournées à la fois — même logique que
 * getTourOccurrences (src/lib/tours.ts) : la sélection de tournée sur la
 * page reste un état client, pas un rendu serveur par tournée.
 */
export async function getTourFillOpportunities(): Promise<Record<string, TourFillOpportunity>> {
  const [tours, zones] = await Promise.all([prisma.tour.findMany(), getZones()]);
  const publicZones: PublicZone[] = zones.map((zone) => ({ id: zone.id, name: zone.name, cities: zone.cities.map((c) => c.name), postalCodes: zone.cities.map((c) => c.postalCode), tourDays: [] }));
  const todayId = toLocalDateId(new Date());

  const opportunities = await Promise.all(tours.map((tour) => computeTourFillOpportunity(tour, publicZones, todayId)));
  const result: Record<string, TourFillOpportunity> = {};
  tours.forEach((tour, index) => {
    const opportunity = opportunities[index];
    if (opportunity) result[tour.id] = opportunity;
  });
  return result;
}
