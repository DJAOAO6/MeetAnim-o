import "server-only";
import { z } from "zod";
import { MapProviderError } from "@/lib/maps/map-types";
import type { Coordinates, OptimizationJob, OptimizationResult } from "@/lib/maps/map-types";

// VROOM (hébergé par HeiGIT) — service tiers utilisé par openrouteservice
// pour l'optimisation de tournées. Même clé/quota qu'openrouteservice.
const VROOM_URL = "https://api.heigit.org/vroom/v0";
const UPSTREAM_TIMEOUT_MS = 10000;

function apiKey(): string {
  const key = process.env.OPENROUTESERVICE_API_KEY;
  if (!key) throw new MapProviderError("Clé openrouteservice manquante", "invalid-key");
  return key;
}

const vroomResponseSchema = z.object({
  code: z.number(),
  routes: z
    .array(
      z.object({
        distance: z.number(),
        duration: z.number(),
        steps: z.array(
          z.object({
            type: z.enum(["start", "job", "end"]),
            id: z.number().optional(),
          }),
        ),
      }),
    )
    .optional(),
  unassigned: z.array(z.object({ id: z.number() })).optional(),
});

/**
 * Propose un meilleur ordre pour une liste d'arrêts, en respectant le
 * départ/arrivée imposés et les fenêtres horaires des arrêts non flexibles.
 * Ne modifie jamais rien — l'appelant (server action) décide seul de
 * proposer/appliquer le résultat, jamais automatiquement.
 *
 * `referenceEpochSeconds` sert de base commune pour convertir les fenêtres
 * horaires (VROOM travaille en secondes Unix absolues) ; typiquement minuit
 * du jour de la tournée.
 */
export async function optimizeStopOrder(
  start: Coordinates,
  end: Coordinates,
  jobs: OptimizationJob[],
  workWindow: { start: number; end: number },
): Promise<OptimizationResult> {
  if (jobs.length === 0) {
    return { order: [], totalDistanceMeters: 0, totalDurationSeconds: 0, unassigned: [] };
  }

  // VROOM exige des id entiers — on garde une table de correspondance vers
  // les refId opaques fournis par l'appelant (jamais interprétés ici).
  const idByIndex = new Map<number, string>();
  jobs.forEach((job, index) => idByIndex.set(index + 1, job.refId));

  const body = {
    vehicles: [
      {
        id: 1,
        profile: "driving-car",
        start: [start.lng, start.lat],
        end: [end.lng, end.lat],
        time_window: [workWindow.start, workWindow.end],
      },
    ],
    jobs: jobs.map((job, index) => ({
      id: index + 1,
      location: [job.location.lng, job.location.lat],
      service: job.serviceDurationSeconds,
      ...(job.timeWindow ? { time_windows: [[job.timeWindow.start, job.timeWindow.end]] } : {}),
    })),
  };

  let response: Response;
  try {
    response = await fetch(VROOM_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8", Authorization: apiKey() },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof MapProviderError) throw error;
    throw new MapProviderError("Service d'optimisation injoignable", "network");
  }

  if (response.status === 429) throw new MapProviderError("Quota openrouteservice dépassé", "quota");
  if (response.status === 401 || response.status === 403) {
    throw new MapProviderError("Clé openrouteservice invalide", "invalid-key");
  }
  if (!response.ok) throw new MapProviderError(`Optimisation : réponse ${response.status}`, "upstream");

  const raw: unknown = await response.json().catch(() => null);
  const parsed = vroomResponseSchema.safeParse(raw);
  if (!parsed.success || !parsed.data.routes || parsed.data.routes.length === 0) {
    throw new MapProviderError("Réponse d'optimisation inattendue", "upstream");
  }

  const route = parsed.data.routes[0];
  const order = route.steps
    .filter((step) => step.type === "job" && step.id !== undefined)
    .map((step) => idByIndex.get(step.id!))
    .filter((refId): refId is string => Boolean(refId));

  const unassigned = (parsed.data.unassigned ?? [])
    .map((entry) => idByIndex.get(entry.id))
    .filter((refId): refId is string => Boolean(refId));

  return {
    order,
    totalDistanceMeters: route.distance,
    totalDurationSeconds: route.duration,
    unassigned,
  };
}
