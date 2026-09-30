/**
 * Lieux des animaux (phase 8.9) : l'endroit où vit un animal quand ce n'est
 * pas chez son propriétaire — haras, élevage, pension… Un lieu est partagé
 * par tous les animaux qui y vivent, quels que soient leurs propriétaires.
 */
export type AnimalPlaceKind = "HARAS" | "ELEVAGE" | "EXPLOITATION" | "CENTRE_EQUESTRE" | "REFUGE" | "AUTRE";

export const animalPlaceKinds: AnimalPlaceKind[] = ["HARAS", "ELEVAGE", "EXPLOITATION", "CENTRE_EQUESTRE", "REFUGE", "AUTRE"];

export const animalPlaceKindLabels: Record<AnimalPlaceKind, string> = {
  HARAS: "Haras",
  ELEVAGE: "Élevage",
  EXPLOITATION: "Exploitation",
  CENTRE_EQUESTRE: "Centre équestre",
  REFUGE: "Refuge",
  AUTRE: "Autre",
};

/** Ce qu'une fiche animal a besoin de savoir de son lieu. */
export type AnimalPlaceRef = { id: string; name: string; kind: AnimalPlaceKind; city: string };

/** Lieu avec son adresse : de quoi préremplir un rendez-vous sur place. */
export type AnimalPlaceAddress = AnimalPlaceRef & {
  address: string;
  postalCode: string;
  latitude: number | null;
  longitude: number | null;
};

/** Un lieu, ses animaux et leurs propriétaires (écran Lieux). */
export type AnimalPlaceSummary = AnimalPlaceAddress & {
  notes: string;
  precision: "EXACT" | "STREET" | "CITY" | null;
  animals: Array<{ id: string; name: string; species: string; clientId: string; ownerName: string }>;
};

export type SavePlaceInput = {
  id?: string;
  name: string;
  kind: AnimalPlaceKind;
  address: string;
  postalCode: string;
  city: string;
  notes: string;
};
