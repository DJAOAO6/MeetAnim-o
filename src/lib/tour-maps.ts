import type { Coordinates } from "@/data/tours";

export type TourMapsLink = { label: string; url: string };
export type TourMapsResult = { links: TourMapsLink[]; excludedStopCount: number };

// Format api=1 : origine + destination + jusqu'à 9 waypoints intermédiaires
// par lien (https://developers.google.com/maps/documentation/urls/get-started).
const MAX_POINTS_PER_LINK = 11;

function coordinatesToParam(point: Coordinates): string {
  return `${point.lat},${point.lng}`;
}

function buildSingleMapsUrl(origin: Coordinates, destination: Coordinates, waypoints: Coordinates[]): string {
  const url = new URL("https://www.google.com/maps/dir/");
  url.searchParams.set("api", "1");
  url.searchParams.set("origin", coordinatesToParam(origin));
  url.searchParams.set("destination", coordinatesToParam(destination));
  if (waypoints.length > 0) url.searchParams.set("waypoints", waypoints.map(coordinatesToParam).join("|"));
  url.searchParams.set("travelmode", "driving");
  return url.toString();
}

/** Lien Google Maps vers un seul arrêt — l'origine est laissée à Maps (position actuelle sur mobile). */
export function buildSingleStopMapsUrl(destination: Coordinates): string {
  const url = new URL("https://www.google.com/maps/dir/");
  url.searchParams.set("api", "1");
  url.searchParams.set("destination", coordinatesToParam(destination));
  url.searchParams.set("travelmode", "driving");
  return url.toString();
}

/** Lien Waze — deep link universel documenté (waze.com/ul), fonctionne sans l'app installée (redirige vers le store). */
export function buildWazeUrl(destination: Coordinates): string {
  const url = new URL("https://waze.com/ul");
  url.searchParams.set("ll", coordinatesToParam(destination));
  url.searchParams.set("navigate", "yes");
  return url.toString();
}

/** Lien Plans (Apple) — daddr seul laisse Plans utiliser la position actuelle comme origine. */
export function buildAppleMapsUrl(destination: Coordinates): string {
  const url = new URL("https://maps.apple.com/");
  url.searchParams.set("daddr", coordinatesToParam(destination));
  url.searchParams.set("dirflg", "d");
  return url.toString();
}

export type NavProvider = "google" | "waze" | "apple";

export const navProviderLabels: Record<NavProvider, string> = {
  google: "Google Maps",
  waze: "Waze",
  apple: "Plans (Apple)",
};

const navProviderBuilders: Record<NavProvider, (destination: Coordinates) => string> = {
  google: buildSingleStopMapsUrl,
  waze: buildWazeUrl,
  apple: buildAppleMapsUrl,
};

export function buildNavUrl(provider: NavProvider, destination: Coordinates): string {
  return navProviderBuilders[provider](destination);
}

/**
 * Construit le ou les liens Google Maps de l'itinéraire complet d'une
 * tournée : origine = cabinet géocodé, ou premier arrêt localisé à défaut ;
 * destination = dernier arrêt localisé (jamais le cabinet — refonte
 * tournées, phase 1.1). Les arrêts sans coordonnées sont exclus, jamais
 * positionnés au hasard. Au-delà de 9 waypoints intermédiaires, la limite du
 * format api=1, découpe en plusieurs liens qui s'enchaînent (le dernier
 * arrêt d'un lien est l'origine du suivant) plutôt que de tronquer la
 * tournée en silence.
 */
export function buildTourMapsLinks(cabinetCoordinates: Coordinates | null, stops: Array<{ coordinates: Coordinates | null }>): TourMapsResult {
  const locatedStopCoordinates = stops
    .map((stop) => stop.coordinates)
    .filter((coordinates): coordinates is Coordinates => coordinates !== null);
  const excludedStopCount = stops.length - locatedStopCoordinates.length;

  if (locatedStopCoordinates.length < 2) return { links: [], excludedStopCount };

  const routePoints: Coordinates[] = cabinetCoordinates ? [cabinetCoordinates, ...locatedStopCoordinates] : locatedStopCoordinates;

  const segments: Coordinates[][] = [];
  let startIndex = 0;
  while (startIndex < routePoints.length - 1) {
    const endIndex = Math.min(startIndex + MAX_POINTS_PER_LINK - 1, routePoints.length - 1);
    segments.push(routePoints.slice(startIndex, endIndex + 1));
    startIndex = endIndex;
  }

  const links = segments.map((segment, index) => ({
    label: segments.length > 1 ? `Itinéraire ${index + 1}/${segments.length}` : "Itinéraire complet",
    url: buildSingleMapsUrl(segment[0], segment[segment.length - 1], segment.slice(1, -1)),
  }));

  return { links, excludedStopCount };
}
