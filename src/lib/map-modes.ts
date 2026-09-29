import { findMatchingZone } from "@/lib/booking-validation";
import type { PublicZone } from "@/data/public-booking";
import type { MapAppointment, MapClientSummary } from "@/data/map-clients";

/**
 * Modes de la carte clients (phase 8.1) : une même carte, quatre questions.
 * Règles pures, sans état, partagées par l'écran et les tests.
 */
export type MapMode = "clients" | "activity" | "reminders" | "tours";

export const MAP_MODES: ReadonlyArray<{ id: MapMode; label: string; param: string; question: string }> = [
  { id: "clients", label: "Clients", param: "clients", question: "Où sont mes clients ?" },
  { id: "activity", label: "Activité", param: "activite", question: "Où vais-je travailler ?" },
  { id: "reminders", label: "Relances", param: "relances", question: "Qui revoir ? Dernière visite et rappels, pour vous organiser — pas une indication de soin." },
  { id: "tours", label: "Tournées", param: "tournees", question: "Quels clients mes zones et mes tournées couvrent-elles ?" },
];

export function parseMapMode(value: string | null): MapMode {
  return MAP_MODES.find((mode) => mode.param === value)?.id ?? "clients";
}

/** Paramètre d'adresse du mode ; aucun pour le mode par défaut. */
export function mapModeParam(mode: MapMode): string | null {
  return mode === "clients" ? null : MAP_MODES.find((item) => item.id === mode)!.param;
}

export type ActivityRange = "today" | "7" | "30";

export const ACTIVITY_RANGES: ReadonlyArray<{ id: ActivityRange; label: string; days: number }> = [
  { id: "today", label: "Aujourd’hui", days: 1 },
  { id: "7", label: "7 jours", days: 7 },
  { id: "30", label: "30 jours", days: 30 },
];

export function parseActivityRange(value: string | null): ActivityRange {
  return value === "today" || value === "30" ? value : "7";
}

/** Jour (AAAA-MM-JJ) décalé de `days` jours, sans fuseau (calcul sur le calendrier). */
export function addDaysToDateId(dateId: string, days: number): string {
  const [year, month, day] = dateId.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** Rendez-vous d'aujourd'hui inclus au dernier jour de la période. */
export function appointmentsInRange(appointments: MapAppointment[], todayId: string, range: ActivityRange): MapAppointment[] {
  const days = ACTIVITY_RANGES.find((item) => item.id === range)!.days;
  const lastId = addDaysToDateId(todayId, days - 1);
  return appointments.filter((appointment) => appointment.dateId >= todayId && appointment.dateId <= lastId);
}

const weekdayFormatter = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

/** « Aujourd’hui », « Demain », puis « Mardi 30 septembre ». */
export function dayHeading(dateId: string, todayId: string): string {
  if (dateId === todayId) return "Aujourd’hui";
  if (dateId === addDaysToDateId(todayId, 1)) return "Demain";
  const label = weekdayFormatter.format(new Date(`${dateId}T00:00:00Z`));
  return label.charAt(0).toLocaleUpperCase("fr-FR") + label.slice(1);
}

export type VisitTier = "recent" | "mid" | "old";

/** Mois pleins entre deux jours (AAAA-MM-JJ). */
export function monthsBetween(fromId: string, toId: string): number {
  const [fy, fm, fd] = fromId.split("-").map(Number);
  const [ty, tm, td] = toId.split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm) - (td < fd ? 1 : 0);
}

/**
 * Ancienneté de la dernière consultation : moins de 3 mois, 3 à 12 mois,
 * plus de 12 mois (ou jamais vu). Une information d'organisation, jamais un
 * avis sur l'état de l'animal.
 */
export function visitTier(lastConsultationAt: string | null, todayId: string): VisitTier {
  if (!lastConsultationAt) return "old";
  const months = monthsBetween(lastConsultationAt, todayId);
  return months < 3 ? "recent" : months < 12 ? "mid" : "old";
}

export type VisitFilter = "all" | "due" | VisitTier;

export const VISIT_FILTERS: ReadonlyArray<{ id: VisitFilter; label: string }> = [
  { id: "all", label: "Tous" },
  { id: "due", label: "À relancer" },
  { id: "recent", label: "Moins de 3 mois" },
  { id: "mid", label: "3 à 12 mois" },
  { id: "old", label: "Plus de 12 mois ou jamais" },
];

export function parseVisitFilter(value: string | null): VisitFilter {
  return VISIT_FILTERS.some((item) => item.id === value) ? (value as VisitFilter) : "all";
}

export function matchesVisitFilter(client: Pick<MapClientSummary, "dueForReminder" | "lastConsultationAt">, filter: VisitFilter, todayId: string): boolean {
  if (filter === "all") return true;
  if (filter === "due") return client.dueForReminder;
  return visitTier(client.lastConsultationAt, todayId) === filter;
}

/**
 * Zones qui couvrent un client — même règle que la réservation en ligne
 * (commune, code postal, ou secteur lieu + rayon), pour qu'un client
 * « dans la zone » ici le soit aussi partout ailleurs.
 */
export function zoneIdsOf(client: Pick<MapClientSummary, "city" | "postalCode" | "coordinates">, zones: PublicZone[]): string[] {
  return zones.filter((zone) => findMatchingZone([zone], client.postalCode || undefined, client.city || undefined, client.coordinates)).map((zone) => zone.id);
}

/** Filtre de zone du mode « Tournées » : une zone, les zones d'une tournée, ou les clients non rattachés. */
export type ZoneFilter = { kind: "zone"; id: string } | { kind: "tour"; id: string } | { kind: "none" };

export function parseZoneFilter(value: string | null): ZoneFilter | null {
  if (!value) return null;
  if (value === "aucune") return { kind: "none" };
  if (value.startsWith("tournee:")) return { kind: "tour", id: value.slice("tournee:".length) };
  return { kind: "zone", id: value };
}

export function zoneFilterParam(filter: ZoneFilter): string {
  return filter.kind === "none" ? "aucune" : filter.kind === "tour" ? `tournee:${filter.id}` : filter.id;
}

/**
 * Qualité d'une position sur la carte (phase 8.7) :
 * - précise : l'adresse de la fiche, trouvée au numéro ou à la rue ;
 * - approximative : l'adresse trouvée seulement à la commune, une adresse
 *   dont la précision n'a pas été vérifiée, ou le dernier rendez-vous à
 *   domicile (souvent une ville saisie à la main) ;
 * - inconnue : pas de position du tout.
 */
export type PositionQuality = "precise" | "approximate" | "unknown";

export function positionQuality(client: Pick<MapClientSummary, "coordinates" | "positionSource" | "precision">): PositionQuality {
  if (!client.coordinates) return "unknown";
  if (client.positionSource === "address" && (client.precision === "EXACT" || client.precision === "STREET")) return "precise";
  return "approximate";
}

export type PositionQualitySummary = Record<PositionQuality, number> & { total: number; reliablePercent: number };

/** Répartition, et part des positions précises (arrondie ; 100 % sans client). */
export function positionQualitySummary(clients: Array<Pick<MapClientSummary, "coordinates" | "positionSource" | "precision">>): PositionQualitySummary {
  const summary = { precise: 0, approximate: 0, unknown: 0 };
  for (const client of clients) summary[positionQuality(client)] += 1;
  const total = clients.length;
  return { ...summary, total, reliablePercent: total ? Math.round((summary.precise / total) * 100) : 100 };
}

/**
 * Réglages de la carte qu'une vue enregistrée peut contenir : ceux de
 * l'adresse de la page, sauf le client ou le rendez-vous ouvert (une vue est
 * un cadrage, pas une sélection). La position de l'appareil n'y figure
 * jamais : « Autour de moi » ne s'écrit pas dans l'adresse.
 */
const MAP_VIEW_KEYS = ["mode", "periode", "suivi", "zone", "especes", "relance", "couleur", "vue", "zones", "lieu", "nom", "rayon", "commune", "adresse", "territoire"];

export function sanitizeMapQuery(query: string): string {
  const source = new URLSearchParams(query.startsWith("?") ? query.slice(1) : query);
  const kept = new URLSearchParams();
  for (const key of MAP_VIEW_KEYS) {
    const value = source.get(key);
    if (value !== null && value.length <= 200) kept.set(key, value);
  }
  return kept.toString();
}
