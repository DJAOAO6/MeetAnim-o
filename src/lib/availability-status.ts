import type { AvailabilitySettings, ExceptionalClosure } from "@/data/settings";

export type AvailabilityMode = "cabinet" | "home";

export const modeLabels: Record<AvailabilityMode, string> = { cabinet: "Cabinet", home: "Domicile" };

export type AvailabilityStatus =
  | { kind: "open" }
  | { kind: "closed" }
  | { kind: "closing"; closure: ExceptionalClosure; until: string }
  | { kind: "scheduled"; closure: ExceptionalClosure; from: string };

export function closureLastDay(closure: ExceptionalClosure): string {
  return closure.endDate && closure.endDate >= closure.date ? closure.endDate : closure.date;
}

export function closureAffects(closure: ExceptionalClosure, mode: AvailabilityMode): boolean {
  if (closure.scope === "Tout fermer") return true;
  return mode === "cabinet" ? closure.scope === "Cabinet uniquement" : closure.scope === "Domicile uniquement";
}

export function toDateId(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

const dateFormatter = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long" });
const shortDateFormatter = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });

/** « 25/09/2026 » — jamais la date brute de la base, illisible d'un coup d'œil. */
export function formatDateId(dateId: string): string {
  return shortDateFormatter.format(new Date(`${dateId}T12:00:00`));
}

export function formatClosurePeriod(closure: ExceptionalClosure): string {
  const last = closureLastDay(closure);
  const from = dateFormatter.format(new Date(`${closure.date}T12:00:00`));
  if (last === closure.date) return `le ${from}`;
  return `du ${from} au ${dateFormatter.format(new Date(`${last}T12:00:00`))}`;
}

/**
 * État affiché sur le badge du tableau de bord. Trois informations
 * différentes, et c'est voulu : « fermé » n'a pas le même sens qu'« ouvert
 * mais fermé la semaine prochaine ». La bascule manuelle
 * (cabinetAvailable/homeAvailable) prime : elle traduit une décision immédiate
 * du praticien, là où une fermeture programmée n'est qu'une date à venir.
 */
export function availabilityStatus(
  mode: AvailabilityMode,
  manuallyOpen: boolean,
  availability: AvailabilitySettings,
  today = new Date(),
): AvailabilityStatus {
  if (!manuallyOpen) return { kind: "closed" };

  const todayId = toDateId(today);
  const relevant = availability.closures
    .filter((closure) => closureAffects(closure, mode))
    .filter((closure) => closureLastDay(closure) >= todayId)
    .sort((a, b) => a.date.localeCompare(b.date));

  const current = relevant.find((closure) => closure.date <= todayId && closureLastDay(closure) >= todayId);
  if (current) return { kind: "closing", closure: current, until: closureLastDay(current) };

  const next = relevant.find((closure) => closure.date > todayId);
  if (next) return { kind: "scheduled", closure: next, from: next.date };

  return { kind: "open" };
}

/** Phrase courte affichée sur le badge, jamais réduite à une couleur. */
export function statusLabel(mode: AvailabilityMode, status: AvailabilityStatus): string {
  const label = modeLabels[mode];
  switch (status.kind) {
    case "open":
      return `${label} ouvert`;
    case "closed":
      return `${label} fermé`;
    case "closing":
      return `${label} fermé ${formatClosurePeriod(status.closure)}`;
    case "scheduled":
      return `${label} ouvert · fermeture ${formatClosurePeriod(status.closure)}`;
  }
}

export type DaySlot = { start: string; end: string };

const dayIds = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;

/**
 * Créneaux réellement ouverts aujourd'hui pour ce mode, tels qu'ils sont
 * configurés dans Disponibilités. Un créneau peut n'être ouvert qu'au cabinet
 * ou qu'à domicile : les deux cartes du tableau de bord n'affichent donc pas
 * forcément les mêmes horaires, et c'est voulu.
 */
export function daySlotsFor(availability: AvailabilitySettings, mode: AvailabilityMode, date = new Date()): DaySlot[] {
  const day = availability.days.find((entry) => entry.id === dayIds[date.getDay()]);
  if (!day || !day.enabled) return [];
  return day.slots
    .filter((slot) => (mode === "cabinet" ? slot.cabinet : slot.home))
    .map((slot) => ({ start: slot.start, end: slot.end }))
    .sort((first, second) => first.start.localeCompare(second.start));
}

/** « 08:00 » → « 08h00 », la façon dont on lit une heure en français. */
export function formatHour(value: string): string {
  return value.replace(":", "h");
}

export function formatSlot(slot: DaySlot): string {
  return `${formatHour(slot.start)} – ${formatHour(slot.end)}`;
}

/**
 * Précision d'horloge ajoutée au statut du jour : « ferme à 19h00 » en dit
 * bien plus que « ouvert » à 18h50. Renvoie null quand il n'y a rien de plus
 * à dire que le statut lui-même.
 *
 * Volontairement séparé de availabilityStatus : cette phrase-ci dépend de
 * l'heure courante, donc elle ne peut être calculée qu'après montage côté
 * client, sans quoi le rendu serveur et le rendu navigateur divergeraient.
 */
export function todayTimingLabel(slots: DaySlot[], now = new Date()): string | null {
  if (slots.length === 0) return null;
  const current = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const openSlot = slots.find((slot) => current >= slot.start && current < slot.end);
  if (openSlot) return `Ferme à ${formatHour(openSlot.end)}`;
  const nextSlot = slots.find((slot) => current < slot.start);
  if (nextSlot) return `Ouvre à ${formatHour(nextSlot.start)}`;
  return "Journée terminée";
}
