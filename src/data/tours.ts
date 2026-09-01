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

export type TourRecurrence = "Toutes les semaines" | "Toutes les deux semaines" | "Tous les mois" | "Une seule fois";

export type TourStartType = "Cabinet" | "Adresse personnalisée";

export type Tour = {
  id: string;
  name: string;
  recurrence: TourRecurrence;
  day: string;
  dateId?: string;
  dateLabel: string;
  startTime: string;
  endTime: string;
  // Rétrocompatibilité uniquement (voir tours-actions.ts) — le nouveau
  // formulaire lit/écrit `zoneIds`, jamais `zoneId` directement.
  zoneId: string;
  zoneIds: string[];
  status: TourStatus;
  appointmentCount: number;
  consultationHours: string;
  // Calculées depuis les vraies coordonnées des arrêts de la prochaine
  // occurrence (distance à vol d'oiseau × ROAD_DETOUR_FACTOR) — remplace
  // l'ancien estimatedKm saisi à la main (refonte tournées, phase 1.3).
  // null si moins de deux points ne sont localisés.
  estimatedDistanceKm: number | null;
  estimatedDurationMinutes: number | null;
  unlocatedStopCount: number;
  // Fin du dernier arrêt + trajet de retour estimé si le cabinet est
  // géocodé — null si la tournée n'a aucun arrêt (mode tournée, phase 2).
  expectedReturnTime: string | null;
  // "jeudi 4 septembre" — null si la tournée n'a plus d'occurrence à venir
  // (ponctuelle passée).
  nextOccurrenceLabel: string | null;
  startType: TourStartType;
  startAddress: string | null;
  startCoordinates: Coordinates | null;
  // Limite douce (avertit, ne bloque jamais l'ajout d'un arrêt) — null = pas de limite.
  maxStops: number | null;
  note: string;
};

export type TourAppointment = {
  id: string;
  time: string;
  endTime: string;
  duration: number;
  animalName: string;
  species: AnimalSpecies | null;
  service: string;
  price: number;
  city: string;
  address: string;
  clientName: string;
  // null si le rendez-vous n'est plus rattaché à un client/animal réel
  // (fiche supprimée) — l'action "Voir la fiche" est alors absente.
  clientId: string | null;
  animalId: string | null;
  // null si aucun client rattaché, ou numéro dans un format non reconnu par
  // toTelHref() — l'action "Appeler" est alors absente, jamais grisée.
  phone: string | null;
  // Heure réelle de clôture (bouton "Consultation réalisée") — null tant
  // que l'arrêt n'est pas terminé ; source de vérité du mode tournée pour
  // distinguer arrêt en cours/à venir/terminé (refonte tournées, phase 2).
  completedAt: string | null;
  // null quand ni le rendez-vous ni la table de villes n'ont de coordonnées
  // réelles — jamais de position devinée (AUDIT-PRODUIT-2026-08-30.md,
  // refonte tournées, prérequis 0.2).
  position: { x: number; y: number } | null;
  coordinates: Coordinates | null;
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
  position: { x: number; y: number } | null;
  coordinates: Coordinates | null;
};
