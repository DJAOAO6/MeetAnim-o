import "server-only";
import { getActiveConnectionsForProvider, getFreshAccessToken, providerFor } from "@/lib/calendar/calendar-connections";
import type { BusyPeriod } from "@/lib/calendar/types";
import { timeToMinutes } from "@/lib/booking-validation";

/**
 * Périodes occupées Google → créneaux indisponibles de la réservation
 * (étape 9 du chantier calendrier). Jamais l'inverse : on ne lit ici que
 * des plages occupées, jamais transformées en rendez-vous internes.
 *
 * Cache court en mémoire (par instance serveur) + délai maximum : une
 * panne ou une lenteur Google ne doit jamais rendre la page de réservation
 * inutilisable (étape 10) — en cas d'échec, la connexion concernée est
 * simplement ignorée (best-effort), jamais une erreur remontée à
 * l'appelant.
 */
const CACHE_TTL_MS = 2 * 60 * 1000;
const FETCH_TIMEOUT_MS = 4000;

type CacheEntry = { expiresAt: number; periods: BusyPeriod[] };
const cache = new Map<string, CacheEntry>();

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error("Délai FreeBusy Google dépassé.")), ms);
    }),
  ]);
}

async function fetchGoogleBusyPeriods(fromIso: string, toIso: string): Promise<BusyPeriod[]> {
  const connections = (await getActiveConnectionsForProvider("GOOGLE")).filter((connection) => connection.blockExternalBusySlots);
  if (connections.length === 0) return [];

  const provider = providerFor("GOOGLE");
  const results = await Promise.allSettled(
    connections.map(async (connection) => {
      const accessToken = await getFreshAccessToken(connection);
      return withTimeout(provider.getBusyPeriods(accessToken, connection.calendarId, fromIso, toIso), FETCH_TIMEOUT_MS);
    }),
  );

  return results.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
}

/** Best-effort, jamais levée : un échec renvoie simplement aucune période (repli sécurisé, étape 10). */
export async function getGoogleBusyPeriods(fromIso: string, toIso: string): Promise<BusyPeriod[]> {
  const cacheKey = `${fromIso}:${toIso}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.periods;

  try {
    const periods = await fetchGoogleBusyPeriods(fromIso, toIso);
    cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, periods });
    return periods;
  } catch {
    return [];
  }
}

function toParisParts(isoInstant: string): { dateId: string; time: string } {
  const date = new Date(isoInstant);
  const dateId = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  const time = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date);
  return { dateId, time };
}

/**
 * Convertit des périodes occupées (instants UTC) en intervalles occupés par
 * jour local Europe/Paris, même forme que OccupiedInterval
 * (appointments-actions.ts) pour pouvoir les fusionner directement dans le
 * même calcul que les rendez-vous internes et les créneaux bloqués.
 */
export function mapBusyPeriodsToOccupiedIntervals(periods: BusyPeriod[]): Record<string, Array<{ start: string; duration: number }>> {
  const result: Record<string, Array<{ start: string; duration: number }>> = {};
  for (const period of periods) {
    const start = toParisParts(period.startIso);
    const end = toParisParts(period.endIso);
    if (start.dateId === end.dateId) {
      const duration = timeToMinutes(end.time) - timeToMinutes(start.time);
      if (duration > 0) (result[start.dateId] ??= []).push({ start: start.time, duration });
      continue;
    }
    // Chevauche minuit (rare pour un agenda professionnel) : découpé en un
    // intervalle par jour local plutôt qu'ignoré.
    const startDuration = 24 * 60 - timeToMinutes(start.time);
    if (startDuration > 0) (result[start.dateId] ??= []).push({ start: start.time, duration: startDuration });
    const endDuration = timeToMinutes(end.time);
    if (endDuration > 0) (result[end.dateId] ??= []).push({ start: "00:00", duration: endDuration });
  }
  return result;
}
