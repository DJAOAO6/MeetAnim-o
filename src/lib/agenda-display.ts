/**
 * Préférences d'affichage de l'agenda, propres à chaque compte.
 *
 * Deux réglages indépendants, à ne pas confondre :
 * - l'**intervalle** (`slotMinutes`) découpe la grille en lignes ;
 * - la **densité** fixe la hauteur d'une ligne à l'écran.
 * Un rendez-vous garde toujours sa vraie durée : 45 min dans une grille
 * d'une heure occupent les trois quarts d'une ligne.
 *
 * Rien ici ne touche aux horaires d'ouverture ni aux rendez-vous : c'est de
 * l'affichage.
 */

export const SLOT_MINUTES = [15, 30, 45, 60, 90] as const;
export type SlotMinutes = (typeof SLOT_MINUTES)[number];

export const DENSITIES = ["compact", "comfortable"] as const;
export type Density = (typeof DENSITIES)[number];

export const MIN_DAY_HOUR = 6;
export const MAX_DAY_HOUR = 23;

export type AgendaDisplay = {
  slotMinutes: SlotMinutes;
  density: Density;
  /** Première heure affichée, entière (6 à 22). */
  dayStart: number;
  /** Dernière heure affichée, entière (7 à 23), toujours après dayStart. */
  dayEnd: number;
  showSaturday: boolean;
  showSunday: boolean;
  /** Faux : les périodes fermées restent affichées, mais atténuées. Les horaires ne changent pas. */
  showClosedZones: boolean;
};

export const DEFAULT_AGENDA_DISPLAY: AgendaDisplay = {
  slotMinutes: 30,
  density: "comfortable",
  dayStart: 8,
  dayEnd: 21,
  showSaturday: true,
  showSunday: true,
  showClosedZones: true,
};

/** Hauteur d'une ligne de grille, en pixels. */
export const ROW_HEIGHT: Record<Density, number> = { compact: 24, comfortable: 40 };

export const SLOT_LABELS: Record<SlotMinutes, string> = { 15: "15 min", 30: "30 min", 45: "45 min", 60: "1 h", 90: "1 h 30" };

function isSlotMinutes(value: unknown): value is SlotMinutes {
  return typeof value === "number" && (SLOT_MINUTES as readonly number[]).includes(value);
}

function isDensity(value: unknown): value is Density {
  return typeof value === "string" && (DENSITIES as readonly string[]).includes(value);
}

function hour(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && value >= MIN_DAY_HOUR && value <= MAX_DAY_HOUR ? value : fallback;
}

/**
 * Ce qui vient du navigateur ou d'une ligne ancienne, ramené à des valeurs
 * valides : une valeur inconnue reprend celle par défaut, et une plage
 * horaire à l'envers est refusée plutôt que retournée.
 */
export function normalizeAgendaDisplay(raw: Partial<Record<keyof AgendaDisplay, unknown>> | null | undefined): AgendaDisplay {
  const input = raw ?? {};
  let dayStart = hour(input.dayStart, DEFAULT_AGENDA_DISPLAY.dayStart);
  let dayEnd = hour(input.dayEnd, DEFAULT_AGENDA_DISPLAY.dayEnd);
  if (dayStart >= dayEnd) {
    dayStart = DEFAULT_AGENDA_DISPLAY.dayStart;
    dayEnd = DEFAULT_AGENDA_DISPLAY.dayEnd;
  }
  return {
    slotMinutes: isSlotMinutes(input.slotMinutes) ? input.slotMinutes : DEFAULT_AGENDA_DISPLAY.slotMinutes,
    density: isDensity(input.density) ? input.density : DEFAULT_AGENDA_DISPLAY.density,
    dayStart,
    dayEnd,
    showSaturday: typeof input.showSaturday === "boolean" ? input.showSaturday : true,
    showSunday: typeof input.showSunday === "boolean" ? input.showSunday : true,
    showClosedZones: typeof input.showClosedZones === "boolean" ? input.showClosedZones : true,
  };
}

/** Vrai si le jour de la semaine (0 = dimanche) est affiché. */
export function isWeekdayShown(weekday: number, display: AgendaDisplay): boolean {
  if (weekday === 6) return display.showSaturday;
  if (weekday === 0) return display.showSunday;
  return true;
}

/**
 * La plage réellement affichée : celle choisie, élargie juste assez pour
 * qu'aucun rendez-vous ne sorte de l'écran. Un réglage d'affichage ne cache
 * jamais un rendez-vous.
 */
export function visibleHourRange(display: AgendaDisplay, eventsMinutes: { start: number; end: number }[]): { startHour: number; endHour: number } {
  let startHour = display.dayStart;
  let endHour = display.dayEnd;
  for (const event of eventsMinutes) {
    startHour = Math.min(startHour, Math.floor(event.start / 60));
    endHour = Math.max(endHour, Math.ceil(event.end / 60));
  }
  return { startHour: Math.max(0, startHour), endHour: Math.min(24, Math.max(endHour, startHour + 1)) };
}

/** Pixels par minute : la hauteur d'une ligne répartie sur sa durée. */
export function pixelsPerMinute(display: Pick<AgendaDisplay, "slotMinutes" | "density">): number {
  return ROW_HEIGHT[display.density] / display.slotMinutes;
}

/**
 * Position d'un rendez-vous dans sa colonne, à sa vraie durée :
 * top = (début − début de journée) / intervalle × hauteur de ligne,
 * height = durée / intervalle × hauteur de ligne.
 */
export function eventGeometry(startMinutes: number, duration: number, startHour: number, pxPerMinute: number): { top: number; height: number } {
  return { top: (startMinutes - startHour * 60) * pxPerMinute, height: duration * pxPerMinute };
}
