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

export type TourRunWithStops = DbTourRun & { stops: DbTourStop[] };

export async function getTourRunForDate(userId: string, dateId: string): Promise<TourRunWithStops | null> {
  const date = new Date(`${dateId}T00:00:00.000Z`);
  return prisma.tourRun.findFirst({
    where: { userId, date },
    include: { stops: { orderBy: { order: "asc" } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function getTourRunById(id: string, userId: string): Promise<TourRunWithStops | null> {
  return prisma.tourRun.findFirst({ where: { id, userId }, include: { stops: { orderBy: { order: "asc" } } } });
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

/**
 * Estimation à vol d'oiseau (× 1.3, voir tour-estimate.ts) — utilisée comme
 * repli quand openrouteservice est indisponible, jamais comme source
 * principale une fois une clé configurée.
 */
export function haversineLegDistanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  return haversineDistanceKm(a, b);
}
