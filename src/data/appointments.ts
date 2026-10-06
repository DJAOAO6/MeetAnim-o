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
  /** Visite multi-animaux (chantier C6) : les rendez-vous d'un même lot la partagent. */
  visitGroupId?: string;
  /** Réalisé par la tâche planifiée, l'heure passée (chantier C7). */
  completedAutomatically?: boolean;
  /**
   * Demande à plusieurs horaires (chantier C8) : ceux proposés par le client,
   * par ordre de préférence, tant que le professionnel n'en a pas retenu un.
   */
  slotOptions?: AppointmentSlotOption[];
  /** Échéance d'une demande à plusieurs horaires (ISO) : sans réponse d'ici là, elle expire. */
  expiresAt?: string;
};

export type AppointmentSlotOption = { id: string; date: string; start: string; rank: number };

export const appointmentStatusLabels: Record<AppointmentStatus, string> = {
  pending: "En attente",
  confirmed: "Confirmé",
  completed: "Terminé",
  cancelled: "Annulé",
};
