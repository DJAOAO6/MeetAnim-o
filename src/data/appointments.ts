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
  animalId?: string;
  animalName: string;
  animalSpecies?: AnimalSpecies;
  serviceName: string;
  mode: AppointmentMode;
  location: string;
  price: number;
  status: AppointmentStatus;
  notes: string;
};

export const appointmentStatusLabels: Record<AppointmentStatus, string> = {
  pending: "En attente",
  confirmed: "Confirmé",
  completed: "Terminé",
  cancelled: "Annulé",
};
