const dayInMs = 24 * 60 * 60 * 1000;

/**
 * La date du jour, recalculée à chaque appel (jamais figée) et normalisée à
 * midi pour éviter les décalages de fuseau horaire dans les calculs de
 * différence de jours.
 */
export function referenceDate(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
}

/** Le lundi de la semaine calendaire contenant la date donnée. */
export function startOfWeek(date: Date): Date {
  const day = date.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + diffToMonday, 12);
}

export function dateId(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function weekDatesFrom(start: Date): Date[] {
  return Array.from({ length: 7 }, (_, index) => new Date(start.getTime() + index * dayInMs));
}

export function daysBetween(fromDateId: string, toDate: Date): number {
  const from = new Date(`${fromDateId}T12:00:00`);
  return Math.round((from.getTime() - toDate.getTime()) / dayInMs);
}

export function relativeDayLabel(targetDateId: string): string {
  const diff = daysBetween(targetDateId, referenceDate());
  if (diff === 0) return "Aujourd’hui";
  if (diff === 1) return "Demain";
  if (diff > 1) return `Dans ${diff} jours`;
  if (diff === -1) return "Hier";
  return `En retard de ${Math.abs(diff)} jours`;
}
