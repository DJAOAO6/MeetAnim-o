import { minutesToTime, timeToMinutes } from "@/lib/booking-validation";

export type StopTimingInput = {
  /** Minute (depuis minuit, non bornée — peut dépasser 1440 si la tournée franchit minuit) à laquelle le trajet vers cet arrêt peut commencer. */
  cursorMinutes: number;
  /** Durée du trajet depuis l'arrêt précédent, en minutes (0 si inconnue). */
  legMinutes: number;
  /** Vrai pour un rendez-vous confirmé (ou un arrêt manuel explicitement verrouillé). */
  locked: boolean;
  /**
   * Heure cible (HH:mm) si l'arrêt est verrouillé — pour un rendez-vous,
   * toujours Appointment.start (jamais une valeur déjà recalculée), voir
   * recomputeStopTimings.
   */
  fixedTime: string | null;
  serviceMinutes: number;
};

export type StopTimingResult = {
  /** Minutes non bornées depuis minuit — à utiliser pour chaîner l'arrêt suivant (jamais reconverties depuis arrivalTime/departureTime, qui sont déjà repliées sur 24h). */
  arrivalMinutes: number;
  departureMinutes: number;
  arrivalTime: string;
  departureTime: string;
  /** Minutes de retard réel par rapport à `fixedTime`, ou null si à l'heure/en avance/non verrouillé. */
  lateWarningMinutes: number | null;
};

const MINUTES_PER_DAY = 1440;

function formatWrapped(minutes: number): string {
  return minutesToTime(((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY);
}

/**
 * Un seul arrêt de la chaîne horaire d'une tournée — extrait de
 * recomputeStopTimings (tour-runs-actions.ts, qui boucle sur les arrêts et
 * persiste le résultat) pour rester testable sans base de données.
 */
export function computeStopTiming(input: StopTimingInput): StopTimingResult {
  const routeArrivalMinutes = input.cursorMinutes + input.legMinutes;
  let arrivalMinutes = routeArrivalMinutes;
  let lateWarningMinutes: number | null = null;

  if (input.locked && input.fixedTime) {
    const fixedMinutes = timeToMinutes(input.fixedTime);
    if (routeArrivalMinutes > fixedMinutes) lateWarningMinutes = routeArrivalMinutes - fixedMinutes;
    arrivalMinutes = Math.max(routeArrivalMinutes, fixedMinutes);
  }

  const departureMinutes = arrivalMinutes + input.serviceMinutes;

  return {
    arrivalMinutes,
    departureMinutes,
    arrivalTime: formatWrapped(arrivalMinutes),
    departureTime: formatWrapped(departureMinutes),
    lateWarningMinutes,
  };
}

/**
 * Chaîne computeStopTiming sur une liste ordonnée d'arrêts, exactement
 * comme recomputeStopTimings — le curseur reste non borné d'un arrêt à
 * l'autre (seul l'affichage replie sur 24h), pour ne pas casser une
 * tournée qui franchirait minuit.
 */
export function chainStopTimings(
  startMinutes: number,
  safetyBufferMinutes: number,
  stops: Array<{ legMinutes: number; locked: boolean; fixedTime: string | null; serviceMinutes: number }>,
): StopTimingResult[] {
  let cursorMinutes = startMinutes;
  const results: StopTimingResult[] = [];

  for (const stop of stops) {
    const timing = computeStopTiming({ cursorMinutes, legMinutes: stop.legMinutes, locked: stop.locked, fixedTime: stop.fixedTime, serviceMinutes: stop.serviceMinutes });
    results.push(timing);
    cursorMinutes = timing.departureMinutes + safetyBufferMinutes;
  }

  return results;
}
