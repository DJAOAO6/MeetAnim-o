import "server-only";
import { z } from "zod";
import { MapProviderError } from "@/lib/maps/map-types";
import type { MatrixResult, RouteAvoidOptions, RoutePreference, RouteResult, RouteWaypoint } from "@/lib/maps/map-types";

// openrouteservice (HeiGIT) — domaine actuel api.heigit.org (l'ancien
// api.openrouteservice.org a été retiré le 24/08/2026, voir
// docs/TOURNEES-CARTOGRAPHIE.md). Clé strictement serveur (OPENROUTESERVICE_API_KEY),
// jamais exposée au navigateur — tous les appels passent par les server
// actions de src/lib/tours-actions.ts, jamais directement depuis un
// composant client.
const ORS_BASE_URL = "https://api.heigit.org/openrouteservice/v2";
const UPSTREAM_TIMEOUT_MS = 8000;
const PROFILE = "driving-car";

function apiKey(): string {
  const key = process.env.OPENROUTESERVICE_API_KEY;
  if (!key) throw new MapProviderError("Clé openrouteservice manquante", "invalid-key");
  return key;
}

function buildAvoidFeatures(options?: RouteAvoidOptions): string[] {
  const features: string[] = [];
  if (options?.avoidHighways) features.push("highways");
  if (options?.avoidTolls) features.push("tollways");
  if (options?.avoidFerries) features.push("ferries");
  return features;
}

async function postJson(url: string, body: unknown): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        Authorization: apiKey(),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof MapProviderError) throw error;
    throw new MapProviderError("Service d'itinéraire injoignable", "network");
  }

  if (response.status === 429) throw new MapProviderError("Quota openrouteservice dépassé", "quota");
  if (response.status === 401 || response.status === 403) {
    throw new MapProviderError("Clé openrouteservice invalide", "invalid-key");
  }
  if (!response.ok) throw new MapProviderError(`openrouteservice a répondu ${response.status}`, "upstream");

  try {
    return await response.json();
  } catch {
    throw new MapProviderError("Réponse openrouteservice invalide", "upstream");
  }
}

const geojsonRouteResponseSchema = z.object({
  features: z.array(
    z.object({
      geometry: z.object({ type: z.literal("LineString"), coordinates: z.array(z.tuple([z.number(), z.number()])) }),
      properties: z.object({
        summary: z.object({ distance: z.number(), duration: z.number() }),
      }),
    }),
  ),
});

/**
 * Calcule un itinéraire routier réel entre au moins 2 points, dans l'ordre
 * fourni (l'appelant décide de l'ordre — pas d'optimisation ici, voir
 * optimization-provider.ts). Ne reçoit jamais d'information client
 * (minimisation des données) : uniquement coordonnées + contraintes.
 */
export async function computeRoute(
  waypoints: RouteWaypoint[],
  options?: RouteAvoidOptions & { preference?: RoutePreference },
): Promise<RouteResult> {
  if (waypoints.length < 2) throw new MapProviderError("Au moins 2 points sont nécessaires", "unknown");

  const avoidFeatures = buildAvoidFeatures(options);
  const body: Record<string, unknown> = {
    coordinates: waypoints.map((point) => [point.lng, point.lat]),
    preference: options?.preference ?? "recommended",
    units: "m",
  };
  if (avoidFeatures.length > 0) body.options = { avoid_features: avoidFeatures };

  const raw = await postJson(`${ORS_BASE_URL}/directions/${PROFILE}/geojson`, body);
  const parsed = geojsonRouteResponseSchema.safeParse(raw);
  if (!parsed.success || parsed.data.features.length === 0) {
    throw new MapProviderError("Réponse d'itinéraire inattendue", "upstream");
  }

  const feature = parsed.data.features[0];
  return {
    distanceMeters: feature.properties.summary.distance,
    durationSeconds: feature.properties.summary.duration,
    geometry: feature.geometry as GeoJSON.LineString,
  };
}

const matrixResponseSchema = z.object({
  distances: z.array(z.array(z.number())).optional(),
  durations: z.array(z.array(z.number())).optional(),
});

/**
 * Distances/durées entre tous les points en un seul appel — à utiliser dès
 * que plus de 2 points doivent être comparés entre eux (détection de
 * trajets incohérents, préparation de l'optimisation) plutôt que
 * d'enchaîner des appels Directions individuels.
 */
export async function computeMatrix(locations: RouteWaypoint[]): Promise<MatrixResult> {
  if (locations.length < 2) throw new MapProviderError("Au moins 2 points sont nécessaires", "unknown");

  const body = {
    locations: locations.map((point) => [point.lng, point.lat]),
    metrics: ["distance", "duration"],
    units: "m",
  };

  const raw = await postJson(`${ORS_BASE_URL}/matrix/${PROFILE}`, body);
  const parsed = matrixResponseSchema.safeParse(raw);
  if (!parsed.success || !parsed.data.distances || !parsed.data.durations) {
    throw new MapProviderError("Réponse matrice inattendue", "upstream");
  }

  return { distancesMeters: parsed.data.distances, durationsSeconds: parsed.data.durations };
}
