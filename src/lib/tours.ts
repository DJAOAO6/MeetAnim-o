import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/db";
import { formatFrenchDate } from "@/lib/format";
import { coordinatesForCity } from "@/data/normandy-cities";
import { jitterCoordinates, projectToPercent } from "@/lib/geo";
import { estimateExpectedReturnTime, estimateTourRoute, type TourEstimate } from "@/lib/tour-estimate";
import { getBusinessProfile } from "@/lib/business-profile-actions";
import { findMatchingZone, minutesToTime, timeToMinutes, toLocalDateId } from "@/lib/booking-validation";
import { nextOccurrenceDateId } from "@/lib/tour-schedule";
import type { AnimalSpecies } from "@/data/species";
import type { City, Coordinates, MapClient, Tour, TourAppointment, Zone } from "@/data/tours";
import type { PublicZone } from "@/data/public-booking";
import type { Tour as DbTour, TourStartType as DbTourStartType, TourStatus as DbTourStatus, Zone as DbZone } from "@/generated/prisma/client";

const statusLabel: Record<DbTourStatus, Tour["status"]> = {
  ACTIVE: "Active",
  INACTIVE: "Inactive",
};

const startTypeLabel: Record<DbTourStartType, Tour["startType"]> = {
  CABINET: "Cabinet",
  CUSTOM: "Adresse personnalisée",
};

type DbTourWithZones = DbTour & { zones: DbZone[] };

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

function formatTimeHHMM(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

type TourOccurrence = { appointmentCount: number; consultationHours: string; stops: TourAppointment[]; estimate: TourEstimate; expectedReturnTime: string | null; nextOccurrenceLabel: string | null };

const nextOccurrenceDateFormatter = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" });

function formatNextOccurrenceLabel(dateId: string): string {
  return nextOccurrenceDateFormatter.format(new Date(`${dateId}T12:00:00.000Z`));
}

/**
 * Arrêts réels d'une tournée à sa prochaine occurrence : rendez-vous à
 * domicile non annulés dont la ville/code postal correspond à la zone de la
 * tournée (AUDIT_COMPLET.md P2-25 — remplace TourAppointment, une table que
 * seul le script de seed pouvait peupler, jamais l'app réelle).
 */
async function computeTourOccurrence(tour: DbTourWithZones, publicZones: PublicZone[], todayId: string, cabinetCoordinates: Coordinates | null): Promise<TourOccurrence> {
  const dateId = nextOccurrenceDateId({ day: tour.day, dateId: tour.dateId ?? undefined, recurrence: tour.recurrence as Tour["recurrence"] }, todayId);
  if (!dateId) return { appointmentCount: 0, consultationHours: "0h", stops: [], estimate: { distanceKm: null, durationMinutes: null, unlocatedStopCount: 0 }, expectedReturnTime: null, nextOccurrenceLabel: null };

  const appointments = await prisma.appointment.findMany({
    where: { date: new Date(`${dateId}T00:00:00.000Z`), mode: "DOMICILE", status: { not: "CANCELLED" } },
    orderBy: { start: "asc" },
    select: {
      id: true, start: true, duration: true, animalName: true, animalSpecies: true, serviceName: true, price: true, location: true, city: true, postalCode: true, clientName: true, latitude: true, longitude: true,
      clientId: true, animalId: true, completedAt: true, client: { select: { phone: true } },
    },
  });

  // Multi-zone (refonte formulaire) : un rendez-vous appartient à la
  // tournée si sa zone correspond à N'IMPORTE LAQUELLE des zones
  // sélectionnées — jamais seulement zoneId (relation historique, conservée
  // uniquement pour ne rien casser côté existant, voir tours-actions.ts).
  const tourZoneIds = new Set(tour.zones.length > 0 ? tour.zones.map((zone) => zone.id) : [tour.zoneId]);
  const matched = appointments.filter((a) => {
    const zoneId = findMatchingZone(publicZones, a.postalCode ?? undefined, a.city ?? undefined)?.id;
    return zoneId != null && tourZoneIds.has(zoneId);
  });
  const totalMinutes = matched.reduce((sum, a) => sum + a.duration, 0);

  const stops: TourAppointment[] = matched.map((a) => {
    // Coordonnées réelles géocodées à la prise de rendez-vous à domicile —
    // jamais de valeur par défaut : un rendez-vous non localisé n'a pas de
    // position plutôt qu'une position fictive (prérequis 0.2).
    const coordinates = a.latitude != null && a.longitude != null ? { lat: a.latitude, lng: a.longitude } : null;
    return {
      id: a.id,
      time: a.start,
      endTime: minutesToTime(timeToMinutes(a.start) + a.duration),
      duration: a.duration,
      animalName: a.animalName,
      species: (a.animalSpecies as AnimalSpecies | null) ?? null,
      service: a.serviceName,
      price: a.price,
      city: a.city ?? "",
      address: a.location,
      clientName: a.clientName,
      clientId: a.clientId,
      animalId: a.animalId,
      phone: a.client?.phone ?? null,
      completedAt: a.completedAt ? formatTimeHHMM(a.completedAt) : null,
      position: coordinates ? projectToPercent(coordinates.lat, coordinates.lng) : null,
      coordinates,
    };
  });

  const estimate = estimateTourRoute(cabinetCoordinates, stops);
  const expectedReturnTime = estimateExpectedReturnTime(cabinetCoordinates, stops[stops.length - 1]);

  return { appointmentCount: stops.length, consultationHours: formatConsultationHours(totalMinutes), stops, estimate, expectedReturnTime, nextOccurrenceLabel: formatNextOccurrenceLabel(dateId) };
}

/**
 * Calculée une seule fois par requête (cache()) : getTours() et
 * getTourStops() en ont tous les deux besoin, inutile de relancer les
 * mêmes requêtes deux fois quand getToursPageData()/getDashboardOverviewData()
 * les appellent ensemble.
 */
const getTourOccurrences = cache(async (): Promise<Map<string, TourOccurrence>> => {
  const [rows, zones, businessProfile] = await Promise.all([prisma.tour.findMany({ include: { zones: true } }), getZones(), getBusinessProfile()]);
  const publicZones = zones.map(zoneToPublicShape);
  const todayId = toLocalDateId(new Date());
  const cabinetCoordinates = businessProfile.latitude != null && businessProfile.longitude != null ? { lat: businessProfile.latitude, lng: businessProfile.longitude } : null;

  const occurrences = await Promise.all(rows.map((tour) => computeTourOccurrence(tour, publicZones, todayId, cabinetCoordinates)));
  return new Map(rows.map((tour, index) => [tour.id, occurrences[index]]));
});

export async function getTours(): Promise<Tour[]> {
  const [rows, occurrences] = await Promise.all([
    prisma.tour.findMany({ orderBy: { name: "asc" }, include: { zones: true } }),
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
      zoneIds: tour.zones.length > 0 ? tour.zones.map((zone) => zone.id) : [tour.zoneId],
      status: statusLabel[tour.status],
      appointmentCount: occurrence?.appointmentCount ?? 0,
      estimatedDistanceKm: occurrence?.estimate.distanceKm ?? null,
      estimatedDurationMinutes: occurrence?.estimate.durationMinutes ?? null,
      unlocatedStopCount: occurrence?.estimate.unlocatedStopCount ?? 0,
      expectedReturnTime: occurrence?.expectedReturnTime ?? null,
      nextOccurrenceLabel: occurrence?.nextOccurrenceLabel ?? null,
      consultationHours: occurrence?.consultationHours ?? "0h",
      startType: startTypeLabel[tour.startType],
      startAddress: tour.startAddress,
      startCoordinates: tour.startLatitude != null && tour.startLongitude != null ? { lat: tour.startLatitude, lng: tour.startLongitude } : null,
      maxStops: tour.maxStops,
      note: tour.note ?? "",
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
      // Dernier rendez-vous à domicile géolocalisé de l'animal : coordonnées
      // réelles à privilégier sur la table de villes en dur (prérequis 0.2).
      appointments: {
        where: { mode: "DOMICILE", latitude: { not: null }, longitude: { not: null } },
        orderBy: { date: "desc" },
        take: 1,
        select: { latitude: true, longitude: true },
      },
    },
    orderBy: { name: "asc" },
  });

  return animals.map((animal): MapClient => {
    const geocodedAppointment = animal.appointments[0];
    const baseCoordinates = geocodedAppointment && geocodedAppointment.latitude != null && geocodedAppointment.longitude != null
      ? { lat: geocodedAppointment.latitude, lng: geocodedAppointment.longitude }
      : coordinatesForCity(animal.client.city);
    const coordinates = baseCoordinates ? jitterCoordinates(baseCoordinates, animal.id) : null;
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
      position: coordinates ? projectToPercent(coordinates.lat, coordinates.lng) : null,
      coordinates,
    };
  });
}

/**
 * Rendez-vous à domicile réels programmés dans les 7 prochains jours,
 * quelle que soit la tournée — historiquement utilisé par le bandeau de
 * statistiques de /dashboard/tournees, retiré depuis la refonte maître-
 * détail (le nouveau design n'a plus ce bandeau). Conservée : fonction
 * encore correcte, pourrait resservir pour un futur indicateur.
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
  const [zones, tours, stops, mapClients, businessProfile] = await Promise.all([
    getZones(),
    getTours(),
    getTourStops(),
    getMapClients(),
    getBusinessProfile(),
  ]);

  const cabinetCoordinates: Coordinates | null = businessProfile.latitude != null && businessProfile.longitude != null
    ? { lat: businessProfile.latitude, lng: businessProfile.longitude }
    : null;

  return {
    zones,
    tours,
    appointments: stops,
    mapClients,
    cabinetCoordinates,
    cabinetAddress: businessProfile.address ? `${businessProfile.address}, ${businessProfile.city}` : businessProfile.city || null,
  };
}
