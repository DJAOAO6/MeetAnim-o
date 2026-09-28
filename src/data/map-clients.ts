import type { AnimalSpecies } from "@/data/species";

/**
 * Carte clients : un client = une entrée, ses animaux regroupés.
 *
 * Distinct de MapClient (une entrée par animal), qui reste celui des
 * tournées : on y planifie un animal précis.
 */
export type MapClientAnimal = {
  id: string;
  name: string;
  species: AnimalSpecies;
  breed: string;
  avatar: string;
  dueForReminder: boolean;
};

/** D'où vient la position affichée : l'adresse de la fiche, ou un rendez-vous à domicile. */
export type MapPositionSource = "address" | "appointment";

export type MapClientSummary = {
  id: string;
  ownerName: string;
  city: string;
  address: string;
  /** Téléphone de la fiche, vide si aucun (l'action « Appeler » disparaît). */
  phone: string;
  animals: MapClientAnimal[];
  /** Dernière consultation, tous animaux confondus, déjà mise en forme. */
  lastConsultation: string;
  /** Même date, brute (AAAA-MM-JJ), pour colorer par ancienneté ; nulle si jamais vu. */
  lastConsultationAt: string | null;
  /** Prochain rappel prévu, tous animaux confondus, déjà mis en forme. */
  nextReminder: string;
  dueForReminder: boolean;
  /** Rappels à envoyer (statut « à relancer ») — pour l'envoi groupé d'une zone. */
  dueReminderIds: string[];
  coordinates: { lat: number; lng: number } | null;
  positionSource: MapPositionSource | null;
  /** Précision d'une position d'adresse ; nulle si inconnue (rendez-vous, ancienne position). */
  precision: "EXACT" | "STREET" | "CITY" | null;
};
