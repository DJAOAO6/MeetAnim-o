import "server-only";
import { prisma } from "@/lib/db";
import { getBusinessProfile } from "@/lib/business-profile-actions";
import { haversineDistanceKm } from "@/lib/geo";
import { findMatchingZone, toLocalDateId } from "@/lib/booking-validation";
import { nextOccurrenceDateId } from "@/lib/tour-schedule";
import { getTourFillOpportunities, type TourFillOpportunity } from "@/lib/tour-fill";
import type { Tour } from "@/data/tours";
import type {
  Appointment as DbAppointment,
  SavedPlace as DbSavedPlace,
  TourPreferences as DbTourPreferences,
  TourRun as DbTourRun,
  TourStop as DbTourStop,
} from "@/generated/prisma/client";

export type ResolvedEndpoint = {
  label: string;
  address: string | null;
  coordinates: { lat: number; lng: number } | null;
};

/**
 * CABINET est résolu depuis BusinessProfile (singleton du cabinet). HOME et
 * FAVORITE pointent tous les deux vers un SavedPlace de l'utilisateur — HOME
 * n'est qu'un raccourci d'affichage ("Domicile" plutôt que le libellé du
 * favori), la donnée de coordonnées vient toujours du SavedPlace référencé
 * par savedPlaceId. CUSTOM porte ses propres address/lat/lng en clair sur la
 * TourRun (adresse saisie manuellement, ou position actuelle résolue côté
 * client au moment de la sauvegarde).
 */
export async function resolveEndpoint(params: {
  type: DbTourRun["startType"];
  savedPlaceId: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  label: string | null;
  savedPlaces: DbSavedPlace[];
}): Promise<ResolvedEndpoint> {
  const { type, savedPlaceId, address, latitude, longitude, label, savedPlaces } = params;

  if (type === "CABINET") {
    const profile = await getBusinessProfile();
    return {
      label: "Cabinet",
      address: profile.address ? `${profile.address}, ${profile.postalCode} ${profile.city}` : null,
      coordinates: profile.latitude != null && profile.longitude != null ? { lat: profile.latitude, lng: profile.longitude } : null,
    };
  }

  if (type === "HOME" || type === "FAVORITE") {
    const place = savedPlaces.find((candidate) => candidate.id === savedPlaceId);
    if (!place) return { label: label ?? (type === "HOME" ? "Domicile" : "Favori"), address: null, coordinates: null };
    return { label: place.label, address: place.address, coordinates: { lat: place.latitude, lng: place.longitude } };
  }

  // CUSTOM, CURRENT_LOCATION (déjà résolue côté client avant envoi),
  // LAST_APPOINTMENT/SAME_AS_START (résolues par l'appelant avant stockage,
  // jamais recalculées ici) : on relit simplement ce qui a été enregistré.
  return {
    label: label ?? "Adresse personnalisée",
    address,
    coordinates: latitude != null && longitude != null ? { lat: latitude, lng: longitude } : null,
  };
}

/**
 * Résout départ ET arrivée d'une TourRun, y compris les cas spéciaux qui ne
 * portent pas leurs propres coordonnées : SAME_AS_START (arrivée = miroir du
 * départ) et LAST_APPOINTMENT (arrivée = dernier arrêt de la liste).
 */
export async function resolveTourEndpoints(
  tourRun: DbTourRun,
  stops: DbTourStop[],
  savedPlaces: DbSavedPlace[],
): Promise<{ start: ResolvedEndpoint; end: ResolvedEndpoint }> {
  const start = await resolveEndpoint({
    type: tourRun.startType,
    savedPlaceId: tourRun.startSavedPlaceId,
    address: tourRun.startAddress,
    latitude: tourRun.startLatitude,
    longitude: tourRun.startLongitude,
    label: tourRun.startLabel,
    savedPlaces,
  });

  if (tourRun.endType === "SAME_AS_START") return { start, end: start };

  if (tourRun.endType === "LAST_APPOINTMENT") {
    const lastLocatedStop = [...stops].reverse().find((stop) => stop.latitude != null && stop.longitude != null);
    if (!lastLocatedStop) return { start, end: { label: "Dernier rendez-vous", address: null, coordinates: null } };
    return {
      start,
      end: { label: lastLocatedStop.label, address: lastLocatedStop.address, coordinates: { lat: lastLocatedStop.latitude!, lng: lastLocatedStop.longitude! } },
    };
  }

  const end = await resolveEndpoint({
    type: tourRun.endType,
    savedPlaceId: tourRun.endSavedPlaceId,
    address: tourRun.endAddress,
    latitude: tourRun.endLatitude,
    longitude: tourRun.endLongitude,
    label: tourRun.endLabel,
    savedPlaces,
  });

  return { start, end };
}

const stopInclude = {
  appointment: {
    select: { animalSpecies: true, price: true, clientId: true, animalId: true, status: true, date: true, completedAt: true, city: true, postalCode: true, client: { select: { phone: true } } },
  },
} as const;

const templateZonesInclude = { template: { select: { zones: { select: { name: true, cities: { select: { name: true, postalCode: true } } } } } } } as const;

type StopAppointment = { animalSpecies: string | null; price: number; clientId: string | null; animalId: string | null; status: string; date: Date; completedAt: Date | null; city: string | null; postalCode: string | null; client: { phone: string } | null };

export type TourRunWithStops = DbTourRun & { stops: (DbTourStop & { appointment: StopAppointment | null })[] } & { template: { zones: { name: string; cities: { name: string; postalCode: string }[] }[] } | null };

export async function getTourRunForDate(userId: string, dateId: string): Promise<TourRunWithStops | null> {
  const date = new Date(`${dateId}T00:00:00.000Z`);
  return prisma.tourRun.findFirst({
    where: { userId, date },
    include: { stops: { orderBy: { order: "asc" }, include: stopInclude }, ...templateZonesInclude },
    orderBy: { createdAt: "desc" },
  });
}

export async function getTourRunById(id: string, userId: string): Promise<TourRunWithStops | null> {
  return prisma.tourRun.findFirst({ where: { id, userId }, include: { stops: { orderBy: { order: "asc" }, include: stopInclude }, ...templateZonesInclude } });
}

// ---------------------------------------------------------------------------
// Vue sérialisable pour le composant client (dates converties en chaînes,
// pas d'objets Prisma bruts qui traverseraient la frontière serveur/client).
// ---------------------------------------------------------------------------

export type TourStopView = {
  id: string;
  appointmentId: string | null;
  order: number;
  type: DbTourStop["type"];
  label: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  arrivalTime: string | null;
  departureTime: string | null;
  serviceDurationMinutes: number | null;
  flexible: boolean;
  locked: boolean;
  timeWindowStart: string | null;
  timeWindowEnd: string | null;
  legDistanceMeters: number | null;
  legDurationSeconds: number | null;
  lateWarningMinutes: number | null;
  notes: string | null;
  animalSpecies: string | null;
  price: number | null;
  clientId: string | null;
  animalId: string | null;
  appointmentStatus: string | null;
  // Unification des tournées, phase 3 : source unique pour "Appeler",
  // "Terminé" et l'avertissement "hors zone" — jamais recalculés côté
  // client, jamais une donnée dupliquée par rapport à Appointment/Tour.zones.
  phone: string | null;
  completedAt: string | null;
  // null = aucun motif (journée créée à la main, ou motif sans zone) : pas
  // d'avertissement affiché dans ce cas, faute de référence à comparer.
  outOfZone: boolean | null;
};

export type TourRunView = {
  id: string;
  name: string;
  dateId: string;
  departureTime: string | null;
  start: { type: string; savedPlaceId: string | null; address: string | null; latitude: number | null; longitude: number | null; label: string | null };
  end: { type: string; savedPlaceId: string | null; address: string | null; latitude: number | null; longitude: number | null; label: string | null };
  resolvedStart: ResolvedEndpoint;
  resolvedEnd: ResolvedEndpoint;
  totalDistanceMeters: number | null;
  totalDurationSeconds: number | null;
  routeGeometry: GeoJSON.LineString | null;
  isRouteEstimate: boolean;
  safetyBufferMinutes: number;
  lunchBreakEnabled: boolean;
  lunchBreakStart: string | null;
  lunchBreakEnd: string | null;
  optimizationPreference: string;
  avoidTolls: boolean;
  avoidHighways: boolean;
  avoidFerries: boolean;
  hasOptimizationProposal: boolean;
  stops: TourStopView[];
  // Unification des tournées, phase 3 bis : zones du motif dont cette
  // journée est issue (voir outOfZone par arrêt ci-dessus, même donnée),
  // dans la forme PublicZone attendue par findMatchingZone (booking-
  // validation.ts, réutilisée telle quelle côté client pour filtrer le
  // calque clients de la carte par secteur) — null si la journée n'est pas
  // issue d'un motif.
  templateZones: { id: string; name: string; cities: string[]; postalCodes: string[]; tourDays: string[] }[] | null;
};

function formatTimeHHMM(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function toTourRunView(tourRun: TourRunWithStops, resolvedStart: ResolvedEndpoint, resolvedEnd: ResolvedEndpoint): TourRunView {
  // Zones du motif dont cette journée est issue, dans la forme attendue par
  // findMatchingZone (booking-validation.ts, déjà testé, pas réécrit ici) —
  // absent si la journée n'est pas issue d'un motif, auquel cas aucun arrêt
  // n'est jamais signalé "hors zone" faute de référence.
  const templateZones = tourRun.template?.zones.map((zone) => ({
    id: zone.name,
    name: zone.name,
    cities: zone.cities.map((city) => city.name),
    postalCodes: zone.cities.map((city) => city.postalCode),
    tourDays: [] as string[],
  })) ?? null;

  return {
    id: tourRun.id,
    name: tourRun.name,
    dateId: toLocalDateId(tourRun.date),
    departureTime: tourRun.departureTime,
    start: { type: tourRun.startType, savedPlaceId: tourRun.startSavedPlaceId, address: tourRun.startAddress, latitude: tourRun.startLatitude, longitude: tourRun.startLongitude, label: tourRun.startLabel },
    end: { type: tourRun.endType, savedPlaceId: tourRun.endSavedPlaceId, address: tourRun.endAddress, latitude: tourRun.endLatitude, longitude: tourRun.endLongitude, label: tourRun.endLabel },
    resolvedStart,
    resolvedEnd,
    totalDistanceMeters: tourRun.totalDistanceMeters,
    totalDurationSeconds: tourRun.totalDurationSeconds,
    routeGeometry: (tourRun.routeGeometry as unknown as GeoJSON.LineString | null) ?? null,
    isRouteEstimate: tourRun.routeGeometry == null && tourRun.totalDistanceMeters != null,
    safetyBufferMinutes: tourRun.safetyBufferMinutes,
    lunchBreakEnabled: tourRun.lunchBreakEnabled,
    lunchBreakStart: tourRun.lunchBreakStart,
    lunchBreakEnd: tourRun.lunchBreakEnd,
    optimizationPreference: tourRun.optimizationPreference,
    avoidTolls: tourRun.avoidTolls,
    avoidHighways: tourRun.avoidHighways,
    avoidFerries: tourRun.avoidFerries,
    hasOptimizationProposal: tourRun.lastOptimizationProposal != null,
    templateZones,
    stops: tourRun.stops.map((stop) => ({
      id: stop.id,
      appointmentId: stop.appointmentId,
      order: stop.order,
      type: stop.type,
      label: stop.label,
      address: stop.address,
      latitude: stop.latitude,
      longitude: stop.longitude,
      arrivalTime: stop.arrivalTime,
      departureTime: stop.departureTime,
      serviceDurationMinutes: stop.serviceDurationMinutes,
      flexible: stop.flexible,
      locked: stop.locked,
      timeWindowStart: stop.timeWindowStart,
      timeWindowEnd: stop.timeWindowEnd,
      legDistanceMeters: stop.legDistanceMeters,
      legDurationSeconds: stop.legDurationSeconds,
      lateWarningMinutes: stop.lateWarningMinutes,
      notes: stop.notes,
      animalSpecies: stop.appointment?.animalSpecies ?? null,
      price: stop.appointment?.price ?? null,
      clientId: stop.appointment?.clientId ?? null,
      animalId: stop.appointment?.animalId ?? null,
      appointmentStatus: stop.appointment?.status ?? null,
      phone: stop.appointment?.client?.phone ?? null,
      completedAt: stop.appointment?.completedAt ? formatTimeHHMM(stop.appointment.completedAt) : null,
      outOfZone: templateZones && stop.appointment?.city
        ? !findMatchingZone(templateZones, stop.appointment.postalCode ?? undefined, stop.appointment.city)
        : null,
    })),
  };
}

export type SavedPlaceView = { id: string; label: string; type: string; address: string; latitude: number; longitude: number; isDefaultStart: boolean; isDefaultEnd: boolean };

export function toSavedPlaceView(place: DbSavedPlace): SavedPlaceView {
  return { id: place.id, label: place.label, type: place.type, address: place.address, latitude: place.latitude, longitude: place.longitude, isDefaultStart: place.isDefaultStart, isDefaultEnd: place.isDefaultEnd };
}

export type AvailableAppointmentView = {
  id: string;
  start: string;
  duration: number;
  animalName: string;
  animalSpecies: string | null;
  clientName: string;
  city: string | null;
  mode: string;
  location: string;
  latitude: number | null;
  longitude: number | null;
  price: number;
  status: string;
};

export function toAvailableAppointmentView(appointment: DbAppointment): AvailableAppointmentView {
  return {
    id: appointment.id,
    start: appointment.start,
    duration: appointment.duration,
    animalName: appointment.animalName,
    animalSpecies: appointment.animalSpecies,
    clientName: appointment.clientName,
    city: appointment.city,
    mode: appointment.mode,
    location: appointment.location,
    latitude: appointment.latitude,
    longitude: appointment.longitude,
    price: appointment.price,
    status: appointment.status,
  };
}

export async function listSavedPlaces(userId: string): Promise<DbSavedPlace[]> {
  return prisma.savedPlace.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });
}

export async function getOrCreateTourPreferences(userId: string): Promise<DbTourPreferences> {
  const existing = await prisma.tourPreferences.findUnique({ where: { userId } });
  if (existing) return existing;
  return prisma.tourPreferences.create({ data: { userId } });
}

/**
 * Rendez-vous du jour non annulés, géolocalisés ou non, qui ne sont pas déjà
 * un arrêt de la tournée en cours d'édition — alimente "+ Ajouter un
 * rendez-vous". Domicile ET cabinet sont proposés (le mode CABINET reste un
 * déplacement légitime de la praticienne si elle reçoit ce jour-là).
 */
export async function getAvailableAppointmentsForDate(dateId: string, excludeTourRunId: string | null): Promise<DbAppointment[]> {
  const date = new Date(`${dateId}T00:00:00.000Z`);
  const alreadyStoppedAppointmentIds = excludeTourRunId
    ? (
        await prisma.tourStop.findMany({
          where: { tourRunId: excludeTourRunId, appointmentId: { not: null } },
          select: { appointmentId: true },
        })
      ).map((row) => row.appointmentId!)
    : [];

  return prisma.appointment.findMany({
    where: {
      date,
      status: { not: "CANCELLED" },
      id: alreadyStoppedAppointmentIds.length > 0 ? { notIn: alreadyStoppedAppointmentIds } : undefined,
    },
    orderBy: { start: "asc" },
  });
}

export function todayDateId(): string {
  return toLocalDateId(new Date());
}

export type TourPreferencesView = {
  defaultStartType: string;
  defaultStartSavedPlaceId: string | null;
  defaultEndType: string;
  defaultEndSavedPlaceId: string | null;
  returnToStart: boolean;
  safetyBufferMinutes: number;
  lunchBreakEnabled: boolean;
  lunchBreakStart: string;
  lunchBreakEnd: string;
  workHoursStart: string;
  workHoursEnd: string;
  optimizationPreference: string;
  avoidTolls: boolean;
  avoidHighways: boolean;
  avoidFerries: boolean;
};

function toTourPreferencesView(preferences: DbTourPreferences): TourPreferencesView {
  return {
    defaultStartType: preferences.defaultStartType,
    defaultStartSavedPlaceId: preferences.defaultStartSavedPlaceId,
    defaultEndType: preferences.defaultEndType,
    defaultEndSavedPlaceId: preferences.defaultEndSavedPlaceId,
    returnToStart: preferences.returnToStart,
    safetyBufferMinutes: preferences.safetyBufferMinutes,
    lunchBreakEnabled: preferences.lunchBreakEnabled,
    lunchBreakStart: preferences.lunchBreakStart,
    lunchBreakEnd: preferences.lunchBreakEnd,
    workHoursStart: preferences.workHoursStart,
    workHoursEnd: preferences.workHoursEnd,
    optimizationPreference: preferences.optimizationPreference,
    avoidTolls: preferences.avoidTolls,
    avoidHighways: preferences.avoidHighways,
    avoidFerries: preferences.avoidFerries,
  };
}

// Unification des tournées, phase 1.3 : réconciliation live entre la
// journée et l'agenda (source de vérité des rendez-vous) — jamais résolue
// automatiquement, seulement signalée pour que l'utilisatrice décide.
export type StopToRemove = { stopId: string; label: string; reason: "cancelled" | "moved" };

export type TourRunEditorData = {
  tourRun: TourRunView | null;
  savedPlaces: SavedPlaceView[];
  preferences: TourPreferencesView;
  availableAppointments: AvailableAppointmentView[];
  cabinet: { address: string | null; latitude: number | null; longitude: number | null };
  // Rendez-vous à domicile de cette date pas encore un arrêt de la journée — "à placer".
  unplacedHomeAppointments: AvailableAppointmentView[];
  // Arrêts dont le rendez-vous lié a été annulé ou déplacé à une autre date — "à retirer".
  stopsToRemove: StopToRemove[];
  // Créneaux encore libres à la prochaine occurrence du motif dont cette
  // journée est issue — uniquement quand `dateId` EST cette prochaine
  // occurrence (getTourFillOpportunities ne calcule que celle-là par motif).
  fillOpportunity: TourFillOpportunity | null;
};

async function resolveFillOpportunity(templateId: string, dateId: string): Promise<TourFillOpportunity | null> {
  const tour = await prisma.tour.findUnique({ where: { id: templateId }, select: { id: true, day: true, dateId: true, recurrence: true } });
  if (!tour) return null;

  const todayId = toLocalDateId(new Date());
  const nextDateId = nextOccurrenceDateId({ day: tour.day, dateId: tour.dateId ?? undefined, recurrence: tour.recurrence as Tour["recurrence"] }, todayId);
  if (nextDateId !== dateId) return null;

  const opportunities = await getTourFillOpportunities();
  return opportunities[tour.id] ?? null;
}

export async function getTourRunEditorData(userId: string, dateId: string): Promise<TourRunEditorData> {
  const [tourRunRow, savedPlaceRows, preferences, profile] = await Promise.all([
    getTourRunForDate(userId, dateId),
    listSavedPlaces(userId),
    getOrCreateTourPreferences(userId),
    getBusinessProfile(),
  ]);

  const availableAppointmentRows = await getAvailableAppointmentsForDate(dateId, tourRunRow?.id ?? null);
  const unplacedHomeAppointmentRows = availableAppointmentRows.filter((appointment) => appointment.mode === "DOMICILE");

  let tourRun: TourRunView | null = null;
  if (tourRunRow) {
    const { start, end } = await resolveTourEndpoints(tourRunRow, tourRunRow.stops, savedPlaceRows);
    tourRun = toTourRunView(tourRunRow, start, end);
  }

  const stopsToRemove: StopToRemove[] = tourRunRow
    ? tourRunRow.stops
        .filter((stop) => stop.appointment && (stop.appointment.status === "CANCELLED" || toLocalDateId(stop.appointment.date) !== dateId))
        .map((stop) => ({
          stopId: stop.id,
          label: stop.label,
          reason: (stop.appointment!.status === "CANCELLED" ? "cancelled" : "moved") as StopToRemove["reason"],
        }))
    : [];

  const fillOpportunity = tourRunRow?.templateId ? await resolveFillOpportunity(tourRunRow.templateId, dateId) : null;

  return {
    tourRun,
    savedPlaces: savedPlaceRows.map(toSavedPlaceView),
    preferences: toTourPreferencesView(preferences),
    availableAppointments: availableAppointmentRows.map(toAvailableAppointmentView),
    cabinet: {
      address: profile.address ? `${profile.address}, ${profile.postalCode} ${profile.city}` : null,
      latitude: profile.latitude,
      longitude: profile.longitude,
    },
    unplacedHomeAppointments: unplacedHomeAppointmentRows.map(toAvailableAppointmentView),
    stopsToRemove,
    fillOpportunity,
  };
}

/**
 * Estimation à vol d'oiseau (× 1.3, voir tour-estimate.ts) — utilisée comme
 * repli quand openrouteservice est indisponible, jamais comme source
 * principale une fois une clé configurée.
 */
export function haversineLegDistanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  return haversineDistanceKm(a, b);
}

// ---------------------------------------------------------------------------
// Unification des tournées, phase 2 : liste de journées datées (page
// tournées) — un seul objet visible, plus de maître-détail sur un motif.
// ---------------------------------------------------------------------------

const dayListLabelFormatter = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" });
const PAST_WINDOW_DAYS = 30;
const UPCOMING_WINDOW_DAYS = 21;

export type TourDayListItem = {
  id: string;
  dateId: string;
  dateLabel: string;
  sectorLabel: string | null;
  stopCount: number;
  distanceKm: number | null;
  durationMinutes: number | null;
  departureTime: string | null;
  recurrenceMention: string | null;
  freeSlotCount: number | null;
};

export type TourDayListData = {
  upcoming: TourDayListItem[];
  past: TourDayListItem[];
};

const recurrenceMentions: Record<string, (day: string) => string> = {
  "Toutes les semaines": (day) => `chaque ${day.toLocaleLowerCase("fr-FR")}`,
  "Toutes les deux semaines": (day) => `un ${day.toLocaleLowerCase("fr-FR")} sur deux`,
  "Tous les mois": () => "chaque mois",
};

/**
 * Journées datées d'un utilisateur sur une fenêtre glissante (passé proche →
 * à venir) — pour la nouvelle page tournées (liste, plus de maître-détail
 * sur un motif). Les créneaux encore libres ne sont calculés que pour la
 * journée qui EST la prochaine occurrence réelle de son motif
 * (getTourFillOpportunities ne calcule que celle-là par motif, voir
 * resolveFillOpportunity ci-dessus) — jamais recalculé occurrence par
 * occurrence.
 */
export async function getTourRunsListData(userId: string, todayId: string): Promise<TourDayListData> {
  const today = new Date(`${todayId}T00:00:00.000Z`);
  const windowStart = new Date(today.getTime() - PAST_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const windowEnd = new Date(today.getTime() + UPCOMING_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const [rows, fillOpportunities] = await Promise.all([
    prisma.tourRun.findMany({
      where: { userId, date: { gte: windowStart, lte: windowEnd } },
      include: {
        stops: { select: { id: true } },
        template: { select: { id: true, day: true, dateId: true, recurrence: true, zones: { select: { name: true } } } },
      },
      orderBy: { date: "asc" },
    }),
    getTourFillOpportunities(),
  ]);

  const upcoming: TourDayListItem[] = [];
  const past: TourDayListItem[] = [];

  for (const row of rows) {
    const dateId = toLocalDateId(row.date);
    if (dateId === todayId) continue; // "Aujourd'hui" est traité à part (voir editorData.tourRun).

    const template = row.template;
    const isNextOccurrence = template
      ? nextOccurrenceDateId({ day: template.day, dateId: template.dateId ?? undefined, recurrence: template.recurrence as Tour["recurrence"] }, todayId) === dateId
      : false;

    const item: TourDayListItem = {
      id: row.id,
      dateId,
      dateLabel: dayListLabelFormatter.format(row.date),
      sectorLabel: template && template.zones.length > 0 ? template.zones.map((zone) => zone.name).join(", ") : null,
      stopCount: row.stops.length,
      distanceKm: row.totalDistanceMeters != null ? Math.round(row.totalDistanceMeters / 100) / 10 : null,
      durationMinutes: row.totalDurationSeconds != null ? Math.round(row.totalDurationSeconds / 60) : null,
      departureTime: row.departureTime,
      recurrenceMention: template ? (recurrenceMentions[template.recurrence]?.(template.day) ?? null) : null,
      freeSlotCount: dateId > todayId && isNextOccurrence && template ? (fillOpportunities[template.id]?.freeSlotCount ?? null) : null,
    };

    if (dateId > todayId) upcoming.push(item);
    else past.push(item);
  }

  // Les plus récentes en premier pour "Passées" (repliées au-delà des 5 dernières côté UI).
  past.reverse();

  return { upcoming, past };
}
