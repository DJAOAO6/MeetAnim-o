import "server-only";
import { prisma } from "@/lib/db";
import { formatFrenchDate } from "@/lib/format";
import { coordinatesForCity } from "@/data/normandy-cities";
import { jitterCoordinates, projectToPercent } from "@/lib/geo";
import type { AnimalSpecies } from "@/data/species";
import type { City, MapClient, Tour, TourAppointment, Zone } from "@/data/tours";
import type { TourStatus as DbTourStatus } from "@/generated/prisma/client";

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

export async function getTours(): Promise<Tour[]> {
  const tours = await prisma.tour.findMany({ orderBy: { name: "asc" } });

  return tours.map((tour) => ({
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
    appointmentCount: tour.appointmentCount,
    estimatedKm: tour.estimatedKm,
    consultationHours: tour.consultationHours,
  }));
}

export async function getTourAppointments(): Promise<Record<string, TourAppointment[]>> {
  const appointments = await prisma.tourAppointment.findMany({ orderBy: { time: "asc" } });
  const grouped: Record<string, TourAppointment[]> = {};

  for (const appointment of appointments) {
    const entry: TourAppointment = {
      id: appointment.id,
      time: appointment.time,
      animalName: appointment.animalName,
      service: appointment.service,
      city: appointment.city,
      clientName: appointment.clientName,
      position: projectToPercent(appointment.lat, appointment.lng),
      coordinates: { lat: appointment.lat, lng: appointment.lng },
    };
    (grouped[appointment.tourId] ??= []).push(entry);
  }

  return grouped;
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

export async function getToursPageData() {
  const [zones, tours, appointments, mapClients] = await Promise.all([
    getZones(),
    getTours(),
    getTourAppointments(),
    getMapClients(),
  ]);

  return { zones, tours, appointments, mapClients };
}
