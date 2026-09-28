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
  /** Code postal de la fiche (vide si inconnu) — sert à rattacher le client à une zone. */
  postalCode: string;
  address: string;
  /** Téléphone de la fiche, vide si aucun (l'action « Appeler » disparaît). */
  phone: string;
  animals: MapClientAnimal[];
  /** Dernière consultation, tous animaux confondus, déjà mise en forme. */
  lastConsultation: string;
  /** Même date, brute (AAAA-MM-JJ), pour colorer par ancienneté ; nulle si jamais vu. */
  lastConsultationAt: string | null;
  /** Prochain rendez-vous (non annulé), déjà mis en forme : « 2 octobre — 14:30 » ; nul s'il n'y en a pas. */
  nextAppointment: string | null;
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

/**
 * Rendez-vous à venir, mode « Activité » de la carte : où vais-je
 * travailler ? Un rendez-vous au cabinet n'a pas de point à lui (il a lieu au
 * lieu d'exercice) ; un rendez-vous à domicile sans coordonnées est listé,
 * jamais placé au hasard.
 */
export type MapAppointment = {
  id: string;
  /** Jour (AAAA-MM-JJ) et heure de début (HH:MM). */
  dateId: string;
  start: string;
  clientId: string | null;
  clientName: string;
  animalName: string;
  animalSpecies: AnimalSpecies | null;
  serviceName: string;
  city: string;
  place: "home" | "cabinet";
  status: "PENDING" | "CONFIRMED" | "COMPLETED";
  coordinates: { lat: number; lng: number } | null;
};
