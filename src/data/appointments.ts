import type { AnimalSpecies } from "@/data/species";

export type AppointmentMode = "cabinet" | "home";
export type AppointmentStatus = "pending" | "confirmed" | "completed" | "cancelled";

export type Appointment = {
  id: string;
  date: string;
  start: string;
  duration: number;
  clientId?: string;
  clientName: string;
  clientPhone?: string;
  animalId?: string;
  animalName: string;
  animalSpecies?: AnimalSpecies;
  serviceName: string;
  mode: AppointmentMode;
  location: string;
  price: number;
  status: AppointmentStatus;
  notes: string;
  // Géocodage (Géoplateforme IGN, comme la réservation publique) : bonus
  // pour l'estimation de trajet (avertissement d'incompatibilité géographique,
  // refonte tournées phase 3.3) — absent tant que l'adresse d'un rendez-vous
  // à domicile n'a pas été sélectionnée via l'autocomplétion.
  postalCode?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
};

export const appointmentStatusLabels: Record<AppointmentStatus, string> = {
  pending: "En attente",
  confirmed: "Confirmé",
  completed: "Terminé",
  cancelled: "Annulé",
};
