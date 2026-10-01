import type { AvailabilitySettings } from "@/data/settings";

/** Intervalle [début, fin) en minutes depuis minuit. */
export type MinuteInterval = [number, number];

/** Intervalles ouverts d'une journée, par mode, triés et sans chevauchement. */
export type OpenIntervals = { cabinet: MinuteInterval[]; home: MinuteInterval[] };

export type DayAvailabilityResult = {
  /**
   * Faux seulement pour un jour non travaillé (jour désactivé, sans plage,
   * ou en vacances). Une journée travaillée que des fermetures vident reste
   * « ouverte » : ses rendez-vous s'affichent, ses intervalles sont vides.
   */
  open: boolean;
  intervals: OpenIntervals;
};

const weekdayLabels = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
const DAY_END = 24 * 60;

function toDateId(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function timeToMinutes(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

/** Fin d'une fermeture : « 23:59 » veut dire « jusqu'au bout de la journée ». */
function closureEndMinutes(value: string): number {
  return value === "23:59" ? DAY_END : timeToMinutes(value);
}

function isWithinVacation(dateId: string, availability: AvailabilitySettings): boolean {
  return availability.vacations.some((vacation) => dateId >= vacation.startDate && dateId <= vacation.endDate);
}

/** Trie et fusionne les intervalles qui se chevauchent ou se touchent (09:00–12:00 + 12:00–14:00 = 09:00–14:00). */
export function mergeIntervals(intervals: MinuteInterval[]): MinuteInterval[] {
  const sorted = intervals.filter(([start, end]) => end > start).sort((first, second) => first[0] - second[0]);
  const merged: MinuteInterval[] = [];
  for (const [start, end] of sorted) {
    const last = merged[merged.length - 1];
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return merged;
}

/** Retire [cutStart, cutEnd) de chaque intervalle — à la minute près. */
export function subtractInterval(intervals: MinuteInterval[], [cutStart, cutEnd]: MinuteInterval): MinuteInterval[] {
  if (cutEnd <= cutStart) return intervals;
  return intervals.flatMap(([start, end]): MinuteInterval[] => {
    if (cutEnd <= start || cutStart >= end) return [[start, end]];
    const pieces: MinuteInterval[] = [];
    if (cutStart > start) pieces.push([start, cutStart]);
    if (cutEnd < end) pieces.push([cutEnd, end]);
    return pieces;
  });
}

/**
 * Pour une date donnée : la journée est-elle travaillée, et quels intervalles
 * sont ouverts, au cabinet et à domicile, à la minute près.
 *
 * Plages habituelles du jour → retrait des fermetures exceptionnelles (selon
 * leur portée) → fusion des intervalles contigus. Les vacances ferment la
 * journée entière.
 */
export function getDayAvailability(date: Date, availability: AvailabilitySettings): DayAvailabilityResult {
  const closedDay: DayAvailabilityResult = { open: false, intervals: { cabinet: [], home: [] } };
  const dateId = toDateId(date);
  if (isWithinVacation(dateId, availability)) return closedDay;

  const weekdayLabel = weekdayLabels[date.getDay()];
  const day = availability.days.find((item) => item.label === weekdayLabel);
  if (!day || !day.enabled || day.slots.length === 0) return closedDay;

  const slotsFor = (mode: "cabinet" | "home") =>
    mergeIntervals(day.slots.filter((slot) => slot[mode]).map((slot): MinuteInterval => [timeToMinutes(slot.start), timeToMinutes(slot.end)]));
  let cabinet = slotsFor("cabinet");
  let home = slotsFor("home");

  for (const closure of availability.closures) {
    // Fermeture sur plusieurs jours : `endDate` borne la période, `date` en
    // est le premier jour. Passé cette date de fin, la fermeture ne
    // s'applique plus — la réouverture n'a besoin d'aucune tâche planifiée.
    const lastDay = closure.endDate && closure.endDate >= closure.date ? closure.endDate : closure.date;
    if (dateId < closure.date || dateId > lastDay) continue;
    const cut: MinuteInterval = [timeToMinutes(closure.start), closureEndMinutes(closure.end)];
    if (closure.scope === "Tout fermer" || closure.scope === "Cabinet uniquement") cabinet = subtractInterval(cabinet, cut);
    if (closure.scope === "Tout fermer" || closure.scope === "Domicile uniquement") home = subtractInterval(home, cut);
  }

  return { open: true, intervals: { cabinet, home } };
}

/** Une minute donnée est-elle ouverte pour au moins un mode ? */
export function isOpenAt(intervals: OpenIntervals, minutes: number): boolean {
  return [...intervals.cabinet, ...intervals.home].some(([start, end]) => minutes >= start && minutes < end);
}

/**
 * Intervalles fermés (aucun mode ouvert) entre deux bornes, en minutes —
 * ce que la grille de l'agenda ombre.
 */
export function computeClosedRanges(intervals: OpenIntervals, fromMinutes: number, toMinutes: number): Array<{ start: number; end: number }> {
  let closed: MinuteInterval[] = [[fromMinutes, toMinutes]];
  for (const open of mergeIntervals([...intervals.cabinet, ...intervals.home])) closed = subtractInterval(closed, open);
  return closed.map(([start, end]) => ({ start, end }));
}
