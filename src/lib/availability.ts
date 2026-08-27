import type { AvailabilitySettings } from "@/data/settings";

export type HourAvailability = { cabinet: boolean; home: boolean };

export type DayAvailabilityResult = {
  open: boolean;
  hourly: Record<number, HourAvailability> | null;
};

const weekdayLabels = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];

function toDateId(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function timeToMinutes(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function isWithinVacation(dateId: string, availability: AvailabilitySettings): boolean {
  return availability.vacations.some((vacation) => dateId >= vacation.startDate && dateId <= vacation.endDate);
}

/**
 * Calcule, pour une date donnée, si la journée est ouverte et l'ouverture
 * heure par heure (cabinet / domicile), en tenant compte des plages
 * habituelles, des vacances et des fermetures exceptionnelles.
 */
export function getDayAvailability(date: Date, availability: AvailabilitySettings): DayAvailabilityResult {
  const dateId = toDateId(date);
  if (isWithinVacation(dateId, availability)) return { open: false, hourly: null };

  const weekdayLabel = weekdayLabels[date.getDay()];
  const day = availability.days.find((item) => item.label === weekdayLabel);
  if (!day || !day.enabled || day.slots.length === 0) return { open: false, hourly: null };

  const hourly: Record<number, HourAvailability> = {};
  for (let hour = 0; hour < 24; hour++) hourly[hour] = { cabinet: false, home: false };

  for (const slot of day.slots) {
    const startMinutes = timeToMinutes(slot.start);
    const endMinutes = timeToMinutes(slot.end);
    for (let hour = 0; hour < 24; hour++) {
      const hourStart = hour * 60;
      const hourEnd = hourStart + 60;
      if (startMinutes < hourEnd && endMinutes > hourStart) {
        if (slot.cabinet) hourly[hour].cabinet = true;
        if (slot.home) hourly[hour].home = true;
      }
    }
  }

  for (const closure of availability.closures) {
    if (closure.date !== dateId) continue;
    const startMinutes = timeToMinutes(closure.start);
    const endMinutes = timeToMinutes(closure.end);
    for (let hour = 0; hour < 24; hour++) {
      const hourStart = hour * 60;
      const hourEnd = hourStart + 60;
      if (startMinutes < hourEnd && endMinutes > hourStart) {
        if (closure.scope === "Tout fermer" || closure.scope === "Cabinet uniquement") hourly[hour].cabinet = false;
        if (closure.scope === "Tout fermer" || closure.scope === "Domicile uniquement") hourly[hour].home = false;
      }
    }
  }

  return { open: true, hourly };
}

export function isHourClosed(hourly: Record<number, HourAvailability> | null, hour: number): boolean {
  if (!hourly) return true;
  return !hourly[hour].cabinet && !hourly[hour].home;
}

export function computeClosedRanges(hourly: Record<number, HourAvailability> | null, startHour: number, endHour: number): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  let rangeStart: number | null = null;

  for (let hour = startHour; hour < endHour; hour++) {
    const closed = isHourClosed(hourly, hour);
    if (closed && rangeStart === null) rangeStart = hour;
    if (!closed && rangeStart !== null) {
      ranges.push({ start: rangeStart, end: hour });
      rangeStart = null;
    }
  }
  if (rangeStart !== null) ranges.push({ start: rangeStart, end: endHour });

  return ranges;
}
