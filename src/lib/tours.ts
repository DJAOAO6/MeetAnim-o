import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/db";
import { formatFrenchDate } from "@/lib/format";
import { coordinatesForCity } from "@/data/normandy-cities";
import { jitterCoordinates, projectToPercent } from "@/lib/geo";
import { findMatchingZone, toLocalDateId } from "@/lib/booking-validation";
import { nextOccurrenceDateId } from "@/lib/tour-schedule";
import type { AnimalSpecies } from "@/data/species";
import type { City, MapClient, Tour, TourAppointment, Zone } from "@/data/tours";
import type { PublicZone } from "@/data/public-booking";
import type { Tour as DbTour, TourStatus as DbTourStatus } from "@/generated/prisma/client";

const statusLabel: Record<DbTourStatus, Tour["status"]> = {
  ACTIVE: "Active",
  INACTIVE: "Inactive",
};

export async function getZones(): Promise<Zone[]> {
  const zones = await prisma.zone.findMany({ include: { cities: true }, orderBy: { name: "asc" } });

  return zones.map((zone): Zone => ({
    id: zone.id,
    name: zone.name,
    cities: zone.cities.map((city): City => ({ id: city.id, name: city.name, postalCode: city.postalCode })),
  }));
}

function zoneToPublicShape(zone: Zone): PublicZone {
  return { id: zone.id, name: zone.name, cities: zone.cities.map((c) => c.name), postalCodes: zone.cities.map((c) => c.postalCode), tourDays: [] };
}

function formatConsultationHours(totalMinutes: number): string {
  if (totalMinutes <= 0) return "0h";
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes > 0 ? `${hours}h${String(minutes).padStart(2, "0")}` : `${hours}h`;
}

type TourOccurrence = { appointmentCount: number; consultationHours: string; stops: TourAppointment[] };

/**
 * Arrêts réels d'une tournée à sa prochaine occurrence : rendez-vous à
 * domicile non annulés dont la ville/code postal correspond à la zone de la
 * tournée (AUDIT_COMPLET.md P2-25 — remplace TourAppointment, une table que
 * seul le script de seed pouvait peupler, jamais l'app réelle).
 */
async function computeTourOccurrence(tour: DbTour, publicZones: PublicZone[], todayId: string): Promise<TourOccurrence> {
  const dateId = nextOccurrenceDateId({ day: tour.day, dateId: tour.dateId ?? undefined, recurrence: tour.recurrence as Tour["recurrence"] }, todayId);
  if (!dateId) return { appointmentCount: 0, consultationHours: "0h", stops: [] };

  const appointments = await prisma.appointment.findMany({
    where: { date: new Date(`${dateId}T00:00:00.000Z`), mode: "DOMICILE", status: { not: "CANCELLED" } },
    orderBy: { start: "asc" },
    select: { id: true, start: true, duration: true, animalName: true, serviceName: true, city: true, postalCode: true, clientName: true, latitude: true, longitude: true },
  });

  const matched = appointments.filter((a) => findMatchingZone(publicZones, a.postalCode ?? undefined, a.city ?? undefined)?.id === tour.zoneId);
  const totalMinutes = matched.reduce((sum, a) => sum + a.duration, 0);

  const stops: TourAppointment[] = matched.map((a) => {
    const lat = a.latitude ?? 49.44;
    const lng = a.longitude ?? 1.1;
    return {
      id: a.id,
      time: a.start,
      animalName: a.animalName,
      service: a.serviceName,
      city: a.city ?? "",
      clientName: a.clientName,
      position: projectToPercent(lat, lng),
      coordinates: { lat, lng },
    };
  });

  return { appointmentCount: stops.length, consultationHours: formatConsultationHours(totalMinutes), stops };
}

/**
 * Calculée une seule fois par requête (cache()) : getTours() et
 * getTourStops() en ont tous les deux besoin, inutile de relancer les
 * mêmes requêtes deux fois quand getToursPageData()/getDashboardOverviewData()
 * les appellent ensemble.
 */
const getTourOccurrences = cache(async (): Promise<Map<string, TourOccurrence>> => {
  const [rows, zones] = await Promise.all([prisma.tour.findMany(), getZones()]);
  const publicZones = zones.map(zoneToPublicShape);
  const todayId = toLocalDateId(new Date());

  const occurrences = await Promise.all(rows.map((tour) => computeTourOccurrence(tour, publicZones, todayId)));
  return new Map(rows.map((tour, index) => [tour.id, occurrences[index]]));
});

export async function getTours(): Promise<Tour[]> {
  const [rows, occurrences] = await Promise.all([
    prisma.tour.findMany({ orderBy: { name: "asc" } }),
    getTourOccurrences(),
  ]);

  return rows.map((tour): Tour => {
    const occurrence = occurrences.get(tour.id);
    return {
      id: tour.id,
      name: tour.name,
      recurrence: tour.recurrence as Tour["recurrence"],
      day: tour.day,
      dateId: tour.dateId ?? undefined,
      dateLabel: tour.dateLabel,
      startTime: tour.startTime,
      endTime: tour.endTime,
      zoneId: tour.zoneId,
      status: statusLabel[tour.status],
      appointmentCount: occurrence?.appointmentCount ?? 0,
      estimatedKm: tour.estimatedKm,
      consultationHours: occurrence?.consultationHours ?? "0h",
    };
  });
}

export async function getTourStops(): Promise<Record<string, TourAppointment[]>> {
  const occurrences = await getTourOccurrences();
  const grouped: Record<string, TourAppointment[]> = {};
  for (const [tourId, occurrence] of occurrences) grouped[tourId] = occurrence.stops;
  return grouped;
}

/**
 * Zones réellement configurées par le praticien (Tournées/Zones), pour la
 * page de réservation publique — AUDIT_COMPLET.md P2-22 : jusqu'ici les
 * zones affichées côté public étaient des données de démonstration figées
 * dans data/public-booking.ts, indépendantes de ce que le praticien
 * configure réellement dans le tableau de bord. tourDays n'est
 * qu'informatif (rassure le visiteur sur un passage régulier) : dérivé des
 * tournées actives associées à chaque zone, pas utilisé pour le calcul de
 * disponibilité. Le frais de déplacement par zone n'est plus porté ici
 * (contrairement aux anciennes données de démonstration) : il dépend de la
 * prestation choisie (ServiceSettings.zoneFees), calculé côté
 * booking-validation.ts.
 */
export async function getPublicZones(): Promise<PublicZone[]> {
  const [zones, tours] = await Promise.all([getZones(), getTours()]);

  return zones.map((zone) => ({
    id: zone.id,
    name: zone.name,
    cities: zone.cities.map((city) => city.name),
    postalCodes: zone.cities.map((city) => city.postalCode),
    tourDays: [...new Set(tours.filter((tour) => tour.zoneId === zone.id && tour.status === "Active").map((tour) => tour.day))],
  }));
}

export async function getMapClients(): Promise<MapClient[]> {
  const animals = await prisma.animal.findMany({
    include: {
      client: true,
      consultations: { orderBy: { date: "desc" }, take: 1 },
      reminders: { orderBy: { dueDate: "asc" }, take: 1 },
    },
    orderBy: { name: "asc" },
  });

  return animals.map((animal): MapClient => {
    const baseCoordinates = coordinatesForCity(animal.client.city);
    const coordinates = jitterCoordinates(baseCoordinates, animal.id);
    const lastConsultation = animal.consultations[0]?.date;
    const reminder = animal.reminders[0];

    return {
      id: animal.id,
      clientId: animal.clientId,
      ownerName: `${animal.client.firstName} ${animal.client.lastName}`,
      animalName: animal.name,
      species: animal.species as AnimalSpecies,
      breed: animal.breed,
      city: animal.client.city,
      lastConsultation: lastConsultation ? formatFrenchDate(lastConsultation) : "Aucune consultation",
      nextReminder: animal.reminderDate ? formatFrenchDate(animal.reminderDate) : "-",
      dueForReminder: reminder?.status === "DUE",
      avatar: animal.avatar,
      position: projectToPercent(coordinates.lat, coordinates.lng),
      coordinates,
    };
  });
}

/**
 * Rendez-vous à domicile réels programmés dans les 7 prochains jours,
 * quelle que soit la tournée — sert au bandeau de statistiques de
 * /dashboard/tournees (AUDIT_COMPLET.md P2-25 : ce total était auparavant
 * une chaîne « 8 » codée en dur, jamais reliée à de vraies données).
 */
export async function getWeeklyHomeAppointmentCount(): Promise<number> {
  const todayId = toLocalDateId(new Date());
  const today = new Date(`${todayId}T00:00:00.000Z`);
  const in7Days = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);

  return prisma.appointment.count({
    where: { mode: "DOMICILE", status: { not: "CANCELLED" }, date: { gte: today, lt: in7Days } },
  });
}

export async function getToursPageData() {
  const [zones, tours, stops, mapClients, weeklyHomeAppointments] = await Promise.all([
    getZones(),
    getTours(),
    getTourStops(),
    getMapClients(),
    getWeeklyHomeAppointmentCount(),
  ]);

  return { zones, tours, appointments: stops, mapClients, weeklyHomeAppointments };
}
