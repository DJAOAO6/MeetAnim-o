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
