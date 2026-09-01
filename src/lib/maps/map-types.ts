// Types partagés par toute la couche cartographique (src/lib/maps/). Les
// composants React et les server actions ne doivent connaître que ces types,
// jamais les formats bruts renvoyés par Géoplateforme/openrouteservice.

export type Coordinates = { lat: number; lng: number };

export type GeocodeSuggestion = {
  id: string;
  label: string;
  houseNumber?: string;
  street?: string;
  postcode: string;
  city: string;
  citycode?: string;
  latitude: number;
  longitude: number;
};

export type ReverseGeocodeResult = {
  label: string;
  postcode: string | null;
  city: string | null;
  latitude: number;
  longitude: number;
};

export type RouteProfile = "driving-car";

export type RouteAvoidOptions = {
  avoidTolls?: boolean;
  avoidHighways?: boolean;
  avoidFerries?: boolean;
};

export type RoutePreference = "fastest" | "shortest" | "recommended";

export type RouteWaypoint = Coordinates;

export type RouteResult = {
  distanceMeters: number;
  durationSeconds: number;
  geometry: GeoJSON.LineString;
};

export type MatrixResult = {
  distancesMeters: number[][];
  durationsSeconds: number[][];
};

export type OptimizationJob = {
  /** Identifiant opaque côté appelant (ex. TourStop.id) — jamais interprété par le provider. */
  refId: string;
  location: Coordinates;
  serviceDurationSeconds: number;
  /** Fenêtre horaire en secondes Unix — absente si l'arrêt est flexible sans contrainte. */
  timeWindow?: { start: number; end: number };
};

export type OptimizationResult = {
  order: string[]; // refId des jobs, dans l'ordre proposé
  totalDistanceMeters: number;
  totalDurationSeconds: number;
  unassigned: string[]; // refId des jobs qu'il n'a pas été possible de placer
};

export class MapProviderError extends Error {
  constructor(
    message: string,
    public readonly kind: "network" | "upstream" | "quota" | "invalid-key" | "unknown" = "unknown",
  ) {
    super(message);
    this.name = "MapProviderError";
  }
}
