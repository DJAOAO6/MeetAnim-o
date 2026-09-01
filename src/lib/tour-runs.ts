import "server-only";
import { prisma } from "@/lib/db";
import { getBusinessProfile } from "@/lib/business-profile-actions";
import { haversineDistanceKm } from "@/lib/geo";
import { toLocalDateId } from "@/lib/booking-validation";
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

const stopInclude = { appointment: { select: { animalSpecies: true, price: true, clientId: true, animalId: true, status: true } } } as const;

export type TourRunWithStops = DbTourRun & { stops: (DbTourStop & { appointment: { animalSpecies: string | null; price: number; clientId: string | null; animalId: string | null; status: string } | null })[] };

export async function getTourRunForDate(userId: string, dateId: string): Promise<TourRunWithStops | null> {
  const date = new Date(`${dateId}T00:00:00.000Z`);
  return prisma.tourRun.findFirst({
    where: { userId, date },
    include: { stops: { orderBy: { order: "asc" }, include: stopInclude } },
    orderBy: { createdAt: "desc" },
  });
}

export async function getTourRunById(id: string, userId: string): Promise<TourRunWithStops | null> {
  return prisma.tourRun.findFirst({ where: { id, userId }, include: { stops: { orderBy: { order: "asc" }, include: stopInclude } } });
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
  notes: string | null;
  animalSpecies: string | null;
  price: number | null;
  clientId: string | null;
  animalId: string | null;
  appointmentStatus: string | null;
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
};

export function toTourRunView(tourRun: TourRunWithStops, resolvedStart: ResolvedEndpoint, resolvedEnd: ResolvedEndpoint): TourRunView {
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
      notes: stop.notes,
      animalSpecies: stop.appointment?.animalSpecies ?? null,
      price: stop.appointment?.price ?? null,
      clientId: stop.appointment?.clientId ?? null,
      animalId: stop.appointment?.animalId ?? null,
      appointmentStatus: stop.appointment?.status ?? null,
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

export type TourRunEditorData = {
  tourRun: TourRunView | null;
  savedPlaces: SavedPlaceView[];
  preferences: TourPreferencesView;
  availableAppointments: AvailableAppointmentView[];
  cabinet: { address: string | null; latitude: number | null; longitude: number | null };
};

export async function getTourRunEditorData(userId: string, dateId: string): Promise<TourRunEditorData> {
  const [tourRunRow, savedPlaceRows, preferences, profile] = await Promise.all([
    getTourRunForDate(userId, dateId),
    listSavedPlaces(userId),
    getOrCreateTourPreferences(userId),
    getBusinessProfile(),
  ]);

  const availableAppointmentRows = await getAvailableAppointmentsForDate(dateId, tourRunRow?.id ?? null);

  let tourRun: TourRunView | null = null;
  if (tourRunRow) {
    const { start, end } = await resolveTourEndpoints(tourRunRow, tourRunRow.stops, savedPlaceRows);
    tourRun = toTourRunView(tourRunRow, start, end);
  }

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
