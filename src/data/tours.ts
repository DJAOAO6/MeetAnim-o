import type { AnimalSpecies } from "@/data/species";

export type { AnimalSpecies };

export type Coordinates = { lat: number; lng: number };

export type City = {
  id: string;
  name: string;
  postalCode: string;
};

export type Zone = {
  id: string;
  name: string;
  cities: City[];
};

export type TourStatus = "Active" | "Inactive";

export type Tour = {
  id: string;
  name: string;
  recurrence: "Toutes les semaines" | "Une seule fois";
  day: string;
  dateId?: string;
  dateLabel: string;
  startTime: string;
  endTime: string;
  zoneId: string;
  status: TourStatus;
  appointmentCount: number;
  estimatedKm: number;
  consultationHours: string;
};

export type TourAppointment = {
  id: string;
  time: string;
  animalName: string;
  service: string;
  city: string;
  clientName: string;
  position: { x: number; y: number };
  coordinates: Coordinates;
};

export type MapClient = {
  id: string;
  clientId: string;
  ownerName: string;
  animalName: string;
  species: AnimalSpecies;
  breed: string;
  city: string;
  lastConsultation: string;
  nextReminder: string;
  dueForReminder: boolean;
  avatar: string;
  position: { x: number; y: number };
  coordinates: Coordinates;
};
