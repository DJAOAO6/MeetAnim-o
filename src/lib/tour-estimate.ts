import { haversineDistanceKm } from "@/lib/geo";
import { minutesToTime, timeToMinutes } from "@/lib/booking-validation";
import type { Coordinates } from "@/data/tours";

// Ratio moyen distance routière / distance à vol d'oiseau en zone rurale
// normande — pas d'API de calcul d'itinéraire réel dans ce chantier (voir
// AGENTS.md, "ne jamais deviner"), une estimation assumée avec le préfixe
// "≈" plutôt qu'un vrai calcul de trajet.
export const ROAD_DETOUR_FACTOR = 1.3;
export const AVERAGE_SPEED_KMH = 60;
const DURATION_ROUNDING_MINUTES = 5;

export type TourEstimate = {
  // null si moins de deux points localisés (cabinet compris) : rien à
  // additionner plutôt qu'une distance inventée.
  distanceKm: number | null;
  durationMinutes: number | null;
  unlocatedStopCount: number;
};

/**
 * Estime la distance/durée d'une tournée : somme des distances à vol
 * d'oiseau entre points consécutifs (cabinet géocodé en départ ET retour
 * s'il est disponible, sinon la tournée part du premier arrêt localisé),
 * multipliée par ROAD_DETOUR_FACTOR. Les arrêts sans coordonnées sont exclus
 * du calcul, jamais placés au hasard (refonte tournées, phase 1.3).
 */
export function estimateTourRoute(cabinetCoordinates: Coordinates | null, stops: Array<{ coordinates: Coordinates | null }>): TourEstimate {
  const unlocatedStopCount = stops.filter((stop) => stop.coordinates === null).length;
  const locatedStopCoordinates = stops
    .map((stop) => stop.coordinates)
    .filter((coordinates): coordinates is Coordinates => coordinates !== null);

  const routePoints: Coordinates[] = cabinetCoordinates
    ? [cabinetCoordinates, ...locatedStopCoordinates, cabinetCoordinates]
    : locatedStopCoordinates;

  if (routePoints.length < 2) return { distanceKm: null, durationMinutes: null, unlocatedStopCount };

  let straightLineKm = 0;
  for (let index = 1; index < routePoints.length; index += 1) {
    straightLineKm += haversineDistanceKm(routePoints[index - 1], routePoints[index]);
  }

  const distanceKm = straightLineKm * ROAD_DETOUR_FACTOR;
  const rawDurationMinutes = (distanceKm / AVERAGE_SPEED_KMH) * 60;
  const durationMinutes = Math.round(rawDurationMinutes / DURATION_ROUNDING_MINUTES) * DURATION_ROUNDING_MINUTES;

  return { distanceKm, durationMinutes, unlocatedStopCount };
}

/**
 * Heure de retour prévue : fin du dernier arrêt, plus le trajet estimé
 * jusqu'au cabinet quand les deux points sont localisés. Sans cabinet
 * géocodé ou dernier arrêt non localisé, retourne simplement l'heure de fin
 * du dernier arrêt — jamais un trajet de retour deviné (mode tournée,
 * phase 2).
 */
export function estimateExpectedReturnTime(cabinetCoordinates: Coordinates | null, lastStop: { endTime: string; coordinates: Coordinates | null } | undefined): string | null {
  if (!lastStop) return null;
  const endMinutes = timeToMinutes(lastStop.endTime);

  if (!cabinetCoordinates || !lastStop.coordinates) return minutesToTime(endMinutes);

  const legKm = haversineDistanceKm(lastStop.coordinates, cabinetCoordinates) * ROAD_DETOUR_FACTOR;
  const legMinutes = Math.round(((legKm / AVERAGE_SPEED_KMH) * 60) / DURATION_ROUNDING_MINUTES) * DURATION_ROUNDING_MINUTES;
  return minutesToTime(endMinutes + legMinutes);
}

function formatApproxDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  if (rest === 0) return `${hours} h`;
  return `${hours} h ${String(rest).padStart(2, "0")}`;
}

/**
 * Texte affiché pour une estimation de tournée. En présence d'arrêt(s) non
 * localisé(s), n'affiche que la distance (partielle, sur les arrêts connus)
 * avec le décompte des arrêts manquants — jamais une durée calculée sur un
 * trajet qu'on sait incomplet.
 */
export function formatTourEstimate(estimate: TourEstimate): string {
  if (estimate.distanceKm === null) {
    return estimate.unlocatedStopCount > 0 ? "Distance non estimée (position inconnue)" : "Distance non estimée";
  }

  const distanceLabel = `≈ ${Math.round(estimate.distanceKm)} km`;

  if (estimate.unlocatedStopCount > 0) {
    const suffix = estimate.unlocatedStopCount > 1 ? `${estimate.unlocatedStopCount} arrêts non localisés` : "1 arrêt non localisé";
    return `${distanceLabel} (${suffix})`;
  }

  return estimate.durationMinutes !== null ? `${distanceLabel} · ≈ ${formatApproxDuration(estimate.durationMinutes)} de route` : distanceLabel;
}
