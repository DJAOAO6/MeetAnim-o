/**
 * Sélection d'un créneau libre dans la grille de l'agenda.
 *
 * Volontairement sans React ni DOM : ces règles décident de ce qu'on a le
 * droit de sélectionner, et ce sont elles qu'il faut pouvoir vérifier sans
 * ouvrir un navigateur.
 */

export type BusyInterval = { start: number; end: number };

export type SlotSelection = {
  /** Index de la colonne de jour dans la semaine affichée. */
  day: number;
  /** Minutes depuis minuit. */
  startMinutes: number;
  endMinutes: number;
};

/** « 13:00 », depuis des minutes depuis minuit. */
export function formatMinutes(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function toMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

/** « 2 h 30 », « 45 min » : la durée telle qu'on la dit à voix haute. */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${String(rest).padStart(2, "0")}`;
}

/**
 * Cale une minute sur le pas de temps réglé dans Disponibilités
 * (`slotInterval`), en arrondissant vers le bas : le créneau commence à
 * l'heure ronde qu'on vient de survoler, jamais à celle d'après. C'est ce qui
 * évite les horaires de la forme 13:07.
 */
export function snapDown(minutes: number, step: number): number {
  const safeStep = step > 0 ? step : 15;
  return Math.floor(minutes / safeStep) * safeStep;
}

export function snapUp(minutes: number, step: number): number {
  const safeStep = step > 0 ? step : 15;
  return Math.ceil(minutes / safeStep) * safeStep;
}

/**
 * Première minute occupée à partir de `from`, s'il y en a une.
 *
 * Sert à empêcher une sélection de traverser un rendez-vous : partir de 13:00
 * et descendre au-delà d'un rendez-vous de 14:00 ne doit pas produire
 * 13:00 → 17:00, qui ne correspond à aucun créneau réservable.
 */
export function nextBusyStart(busy: BusyInterval[], from: number): number | null {
  let earliest: number | null = null;
  for (const interval of busy) {
    if (interval.start >= from && (earliest === null || interval.start < earliest)) earliest = interval.start;
  }
  return earliest;
}

/** Vrai si l'intervalle [start, end) touche un créneau déjà occupé. */
export function overlapsBusy(busy: BusyInterval[], start: number, end: number): boolean {
  return busy.some((interval) => start < interval.end && interval.start < end);
}

export type SelectionBounds = {
  /** Bornes de la grille affichée, en minutes depuis minuit. */
  dayStart: number;
  dayEnd: number;
  step: number;
  /** Durée appliquée à un simple clic, avant tout glissement. */
  defaultDuration: number;
  busy: BusyInterval[];
};

/**
 * Créneau produit par un simple clic : il commence au pas de temps survolé et
 * dure la durée de rendez-vous par défaut du cabinet — raccourcie s'il n'y a
 * pas la place jusqu'au prochain rendez-vous ou jusqu'à la fin de la grille.
 *
 * Renvoie null quand la minute cliquée est déjà occupée : un clic sur un
 * rendez-vous n'appartient pas à la sélection de zone libre.
 */
export function selectionFromClick(day: number, minutes: number, bounds: SelectionBounds): SlotSelection | null {
  const start = Math.max(bounds.dayStart, snapDown(minutes, bounds.step));
  if (start >= bounds.dayEnd) return null;
  if (overlapsBusy(bounds.busy, start, start + 1)) return null;

  const busyStart = nextBusyStart(bounds.busy, start);
  const ceiling = Math.min(bounds.dayEnd, busyStart ?? bounds.dayEnd);
  const end = Math.min(start + bounds.defaultDuration, ceiling);
  // Sous un pas de temps, le créneau ne veut plus rien dire : on ne propose
  // pas une sélection de cinq minutes coincée avant un rendez-vous.
  if (end - start < bounds.step) return null;

  return { day, startMinutes: start, endMinutes: end };
}

/**
 * Créneau produit par un glissement, de la minute d'origine à la minute
 * courante. Le glissement peut remonter : la sélection se construit alors
 * vers le haut, et c'est le comportement attendu d'un agenda.
 *
 * La sélection s'arrête au premier rendez-vous rencontré (§15) — jamais
 * au-delà, même si le pointeur continue.
 */
export function selectionFromDrag(day: number, anchorMinutes: number, pointerMinutes: number, bounds: SelectionBounds): SlotSelection | null {
  const anchor = Math.max(bounds.dayStart, Math.min(bounds.dayEnd - bounds.step, snapDown(anchorMinutes, bounds.step)));
  const pointer = Math.max(bounds.dayStart, Math.min(bounds.dayEnd, pointerMinutes));

  if (pointer >= anchor) {
    const busyStart = nextBusyStart(bounds.busy, anchor);
    const ceiling = Math.min(bounds.dayEnd, busyStart ?? bounds.dayEnd);
    const end = Math.min(Math.max(snapUp(pointer, bounds.step), anchor + bounds.step), ceiling);
    if (end - anchor < bounds.step) return null;
    return { day, startMinutes: anchor, endMinutes: end };
  }

  // Vers le haut : le plancher est la fin du dernier rendez-vous situé
  // au-dessus du point de départ.
  const anchorEnd = anchor + bounds.step;
  let floor = bounds.dayStart;
  for (const interval of bounds.busy) {
    if (interval.end <= anchor && interval.end > floor) floor = interval.end;
  }
  const start = Math.max(floor, Math.min(snapDown(pointer, bounds.step), anchor));
  if (anchorEnd - start < bounds.step) return null;
  return { day, startMinutes: start, endMinutes: anchorEnd };
}

/** Durées proposées sur téléphone, bornées par la place réellement libre. */
export function availableDurations(selection: SlotSelection, bounds: SelectionBounds): number[] {
  const busyStart = nextBusyStart(bounds.busy, selection.startMinutes);
  const ceiling = Math.min(bounds.dayEnd, busyStart ?? bounds.dayEnd);
  const room = ceiling - selection.startMinutes;
  const candidates = [30, 60, 90, 120];
  const durations = candidates.filter((duration) => duration <= room);
  // Toujours au moins une proposition : si même trente minutes ne tiennent
  // pas, on propose la place réellement disponible.
  if (durations.length === 0 && room >= bounds.step) return [room];
  return durations;
}
