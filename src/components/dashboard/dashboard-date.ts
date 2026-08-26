export const referenceDate = new Date(2026, 7, 24, 12);
const dayInMs = 24 * 60 * 60 * 1000;

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
  const diff = daysBetween(targetDateId, referenceDate);
  if (diff === 0) return "Aujourd’hui";
  if (diff === 1) return "Demain";
  if (diff > 1) return `Dans ${diff} jours`;
  if (diff === -1) return "Hier";
  return `En retard de ${Math.abs(diff)} jours`;
}
