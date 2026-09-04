"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { isRateLimited, recordAttempt } from "@/lib/rate-limit";
import { resolveTourEndpoints, getOrCreateTourPreferences, listSavedPlaces } from "@/lib/tour-runs";
import { saveAppointmentAction, updateAppointmentStatusAction } from "@/lib/appointments-actions";
import { toAppointment } from "@/lib/appointments";
import { computeRoute, computeMatrix } from "@/lib/maps/routing-provider";
import { optimizeStopOrder } from "@/lib/maps/optimization-provider";
import { reverseGeocode } from "@/lib/maps/geocoding-provider";
import { haversineDistanceKm } from "@/lib/geo";
import { timeToMinutes } from "@/lib/booking-validation";
import { chainStopTimings, type StopTimingResult } from "@/lib/tour-timing";
import { Prisma } from "@/generated/prisma/client";
import type { TourEndpointType, TourStopType, TourRun as DbTourRun, TourStop as DbTourStop, Appointment as DbAppointment } from "@/generated/prisma/client";

const TOURS_PATH = "/dashboard/tournees";

export type ActionResult = { ok: true } | { ok: false; error: string };

const GENERIC_ERROR = "Une erreur est survenue. Réessayez.";
const ROUTE_UNAVAILABLE_ERROR = "Impossible de calculer l'itinéraire pour le moment. La tournée reste modifiable.";

// ---------------------------------------------------------------------------
// Ownership helpers — jamais faire confiance à un id envoyé par le client
// sans vérifier qu'il appartient bien à l'utilisateur courant.
// ---------------------------------------------------------------------------

async function requireOwnedTourRun(tourRunId: string, userId: string) {
  const tourRun = await prisma.tourRun.findFirst({ where: { id: tourRunId, userId } });
  if (!tourRun) throw new Error("NOT_FOUND");
  return tourRun;
}

// ---------------------------------------------------------------------------
// Recalcul d'itinéraire — appelé après toute modification pertinente
// (ajout/suppression/réordonnancement d'arrêt, changement départ/arrivée,
// changement d'options). Dégrade proprement : la tournée reste éditable et
// sauvegardable même si openrouteservice est indisponible (les champs de
// cache sont alors simplement effacés plutôt que faussés).
// ---------------------------------------------------------------------------

function mapPreference(pref: "TIME" | "DISTANCE" | "BALANCED"): "fastest" | "shortest" | "recommended" {
  if (pref === "TIME") return "fastest";
  if (pref === "DISTANCE") return "shortest";
  return "recommended";
}

async function recomputeAndPersistRoute(tourRunId: string): Promise<{ ok: boolean; degraded?: boolean }> {
  const tourRun = await prisma.tourRun.findUnique({ where: { id: tourRunId }, include: { stops: { orderBy: { order: "asc" } } } });
  if (!tourRun) return { ok: false };

  const savedPlaces = await listSavedPlaces(tourRun.userId);
  const { start, end } = await resolveTourEndpoints(tourRun, tourRun.stops, savedPlaces);

  const points: { lat: number; lng: number }[] = [];
  if (start.coordinates) points.push(start.coordinates);
  for (const stop of tourRun.stops) {
    if (stop.latitude != null && stop.longitude != null) points.push({ lat: stop.latitude, lng: stop.longitude });
  }
  if (end.coordinates) points.push(end.coordinates);

  if (points.length < 2) {
    await prisma.tourRun.update({
      where: { id: tourRunId },
      data: { totalDistanceMeters: null, totalDurationSeconds: null, routeGeometry: Prisma.DbNull, routeComputedAt: null },
    });
    return { ok: true };
  }

  try {
    const route = await computeRoute(points, {
      avoidTolls: tourRun.avoidTolls,
      avoidHighways: tourRun.avoidHighways,
      avoidFerries: tourRun.avoidFerries,
      preference: mapPreference(tourRun.optimizationPreference),
    });

    await prisma.$transaction([
      prisma.tourRun.update({
        where: { id: tourRunId },
        data: {
          totalDistanceMeters: Math.round(route.distanceMeters),
          totalDurationSeconds: Math.round(route.durationSeconds),
          routeGeometry: route.geometry as unknown as object,
          routeComputedAt: new Date(),
        },
      }),
      // Le premier/dernier tronçon correspond au départ/à l'arrivée (pas un
      // TourStop) quand ceux-ci sont géolocalisés : on décale les legs vers
      // les arrêts en conséquence.
      ...tourRun.stops
        .filter((stop) => stop.latitude != null && stop.longitude != null)
        .map((stop, index) => {
          const legIndex = start.coordinates ? index : index - 1;
          const leg = legIndex >= 0 ? route.legs[legIndex] : undefined;
          return prisma.tourStop.update({
            where: { id: stop.id },
            data: { legDistanceMeters: leg ? Math.round(leg.distanceMeters) : null, legDurationSeconds: leg ? Math.round(leg.durationSeconds) : null },
          });
        }),
    ]);

    await recomputeStopTimings(tourRunId);
    return { ok: true };
  } catch {
    // Repli : estimation à vol d'oiseau (× 1.3), déjà utilisée ailleurs dans
    // l'app (tour-estimate.ts) — geometry laissée vide (pas de tracé réel),
    // l'UI l'interprète comme "estimation" plutôt que "itinéraire réel".
    const ROAD_DETOUR_FACTOR = 1.3;
    let totalKm = 0;
    for (let i = 0; i < points.length - 1; i += 1) totalKm += haversineDistanceKm(points[i], points[i + 1]) * ROAD_DETOUR_FACTOR;
    const AVERAGE_SPEED_KMH = 60;

    await prisma.tourRun.update({
      where: { id: tourRunId },
      data: {
        totalDistanceMeters: Math.round(totalKm * 1000),
        totalDurationSeconds: Math.round((totalKm / AVERAGE_SPEED_KMH) * 3600),
        routeGeometry: Prisma.DbNull,
        routeComputedAt: new Date(),
      },
    });
    await recomputeStopTimings(tourRunId);

    // Toujours "dégradé" ici, y compris quand la clé n'est simplement pas
    // encore configurée (invalid-key) : dans tous les cas l'itinéraire
    // affiché est une estimation à vol d'oiseau, pas le tracé réel — le
    // message reste volontairement calme ("reste modifiable"), pas une
    // alerte bloquante.
    return { ok: true, degraded: true };
  }
}

/**
 * Chaîne les heures d'arrivée/départ de chaque arrêt à partir de l'heure de
 * départ de la tournée (ou de TourPreferences.workHoursStart à défaut) et des
 * temps de trajet (route réelle si disponible, sinon repli déjà posé sur
 * legDurationSeconds par recomputeAndPersistRoute). Un arrêt verrouillé
 * (locked=true, cas par défaut d'un rendez-vous fixe) impose son heure
 * d'arrivée plutôt que de la recalculer — le décalage éventuel se répercute
 * sur les arrêts suivants, jamais en remontant en arrière.
 */
async function recomputeStopTimings(tourRunId: string): Promise<void> {
  const tourRun = await prisma.tourRun.findUnique({
    where: { id: tourRunId },
    include: { stops: { orderBy: { order: "asc" }, include: { appointment: { select: { start: true } } } } },
  });
  if (!tourRun) return;

  const preferences = await getOrCreateTourPreferences(tourRun.userId);
  const startMinutes = timeToMinutes(tourRun.departureTime ?? preferences.workHoursStart);

  // Un rendez-vous confirmé doit toujours viser SON horaire réel
  // (Appointment.start), jamais une valeur déjà recalculée à une passe
  // précédente — sinon un retard une fois détecté se propagerait comme
  // nouvelle "heure fixe" à chaque recalcul suivant. Un arrêt manuel
  // verrouillé n'a pas de meilleure source que sa dernière heure connue.
  const timings = chainStopTimings(
    startMinutes,
    tourRun.safetyBufferMinutes,
    tourRun.stops.map((stop) => ({
      legMinutes: stop.legDurationSeconds != null ? Math.round(stop.legDurationSeconds / 60) : 0,
      locked: stop.locked,
      fixedTime: stop.locked ? (stop.appointment?.start ?? stop.arrivalTime) : null,
      serviceMinutes: stop.serviceDurationMinutes ?? 0,
    })),
  );

  await prisma.$transaction(
    tourRun.stops.map((stop, index) =>
      prisma.tourStop.update({
        where: { id: stop.id },
        data: { arrivalTime: timings[index].arrivalTime, departureTime: timings[index].departureTime, lateWarningMinutes: timings[index].lateWarningMinutes },
      }),
    ),
  );
}

/**
 * Calcule les horaires qu'un ordre d'arrêts PROPOSÉ produirait, sans rien
 * écrire en base — même logique que recomputeAndPersistRoute/
 * recomputeStopTimings (route réelle, repli à vol d'oiseau si
 * openrouteservice échoue), mais pour un ordre hypothétique. Sert à savoir,
 * avant d'appliquer un réordonnancement, si l'heure d'un rendez-vous en
 * serait changée (phase 3 ter : « jamais en silence »).
 */
async function computeTimingsForOrder(
  tourRun: DbTourRun,
  orderedStops: Array<DbTourStop & { appointment: DbAppointment | null }>,
): Promise<Map<string, StopTimingResult>> {
  const savedPlaces = await listSavedPlaces(tourRun.userId);
  const { start, end } = await resolveTourEndpoints(tourRun, orderedStops, savedPlaces);

  const locatedStops = orderedStops.filter((stop) => stop.latitude != null && stop.longitude != null);
  const legMinutesByStopId = new Map<string, number>();

  if (locatedStops.length > 0) {
    const points: { lat: number; lng: number }[] = [];
    if (start.coordinates) points.push(start.coordinates);
    for (const stop of locatedStops) points.push({ lat: stop.latitude!, lng: stop.longitude! });
    if (end.coordinates) points.push(end.coordinates);

    if (points.length >= 2) {
      try {
        const route = await computeRoute(points, {
          avoidTolls: tourRun.avoidTolls,
          avoidHighways: tourRun.avoidHighways,
          avoidFerries: tourRun.avoidFerries,
          preference: mapPreference(tourRun.optimizationPreference),
        });
        locatedStops.forEach((stop, index) => {
          const legIndex = start.coordinates ? index : index - 1;
          const leg = legIndex >= 0 ? route.legs[legIndex] : undefined;
          legMinutesByStopId.set(stop.id, leg ? Math.round(leg.durationSeconds / 60) : 0);
        });
      } catch {
        const ROAD_DETOUR_FACTOR = 1.3;
        const AVERAGE_SPEED_KMH = 60;
        let previous = start.coordinates;
        for (const stop of locatedStops) {
          const coords = { lat: stop.latitude!, lng: stop.longitude! };
          const km = previous ? haversineDistanceKm(previous, coords) * ROAD_DETOUR_FACTOR : 0;
          legMinutesByStopId.set(stop.id, Math.round((km / AVERAGE_SPEED_KMH) * 60));
          previous = coords;
        }
      }
    }
  }

  const preferences = await getOrCreateTourPreferences(tourRun.userId);
  const startMinutes = timeToMinutes(tourRun.departureTime ?? preferences.workHoursStart);

  const timings = chainStopTimings(
    startMinutes,
    tourRun.safetyBufferMinutes,
    orderedStops.map((stop) => ({
      legMinutes: legMinutesByStopId.get(stop.id) ?? 0,
      locked: stop.locked,
      fixedTime: stop.locked ? (stop.appointment?.start ?? stop.arrivalTime) : null,
      serviceMinutes: stop.serviceDurationMinutes ?? 0,
    })),
  );

  const result = new Map<string, StopTimingResult>();
  orderedStops.forEach((stop, index) => result.set(stop.id, timings[index]));
  return result;
}

// ---------------------------------------------------------------------------
// Création / suppression / réglages
// ---------------------------------------------------------------------------

const endpointTypeSchema = z.enum(["CABINET", "HOME", "FAVORITE", "CUSTOM", "CURRENT_LOCATION", "LAST_APPOINTMENT", "SAME_AS_START"]);

const endpointInputSchema = z.object({
  type: endpointTypeSchema,
  savedPlaceId: z.string().cuid().nullable().optional(),
  address: z.string().max(300).nullable().optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  label: z.string().max(100).nullable().optional(),
});

const createTourRunSchema = z.object({
  name: z.string().trim().min(1).max(100),
  dateId: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  departureTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullable()
    .optional(),
  start: endpointInputSchema,
  end: endpointInputSchema,
});

export type CreateTourRunResult = { ok: true; id: string } | { ok: false; error: string };

export async function createTourRunAction(input: z.infer<typeof createTourRunSchema>): Promise<CreateTourRunResult> {
  const user = await requireUser();
  const parsed = createTourRunSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: GENERIC_ERROR };
  const data = parsed.data;

  // L'index unique (templateId, date, userId) ne protège pas ce chemin :
  // une création manuelle a toujours templateId=null, et Postgres ne
  // considère jamais deux NULL comme en conflit — vérification explicite
  // pour garder l'invariant "un seul objet visible par date" (audit de
  // conformité, constat n°8).
  const existing = await prisma.tourRun.findFirst({ where: { userId: user.id, date: new Date(`${data.dateId}T00:00:00.000Z`) }, select: { id: true } });
  if (existing) return { ok: false, error: "Une journée existe déjà pour cette date." };

  const tourRun = await prisma.tourRun.create({
    data: {
      userId: user.id,
      name: data.name,
      date: new Date(`${data.dateId}T00:00:00.000Z`),
      departureTime: data.departureTime ?? null,
      startType: data.start.type as TourEndpointType,
      startSavedPlaceId: data.start.savedPlaceId ?? null,
      startAddress: data.start.address ?? null,
      startLatitude: data.start.latitude ?? null,
      startLongitude: data.start.longitude ?? null,
      startLabel: data.start.label ?? null,
      endType: data.end.type as TourEndpointType,
      endSavedPlaceId: data.end.savedPlaceId ?? null,
      endAddress: data.end.address ?? null,
      endLatitude: data.end.latitude ?? null,
      endLongitude: data.end.longitude ?? null,
      endLabel: data.end.label ?? null,
    },
  });

  revalidatePath(TOURS_PATH);
  return { ok: true, id: tourRun.id };
}

const updateEndpointsSchema = z.object({
  tourRunId: z.string().cuid(),
  departureTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullable()
    .optional(),
  start: endpointInputSchema,
  end: endpointInputSchema,
});

export async function updateTourRunEndpointsAction(input: z.infer<typeof updateEndpointsSchema>): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = updateEndpointsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: GENERIC_ERROR };
  const data = parsed.data;

  try {
    await requireOwnedTourRun(data.tourRunId, user.id);
  } catch {
    return { ok: false, error: GENERIC_ERROR };
  }

  await prisma.tourRun.update({
    where: { id: data.tourRunId },
    data: {
      departureTime: data.departureTime ?? null,
      startType: data.start.type as TourEndpointType,
      startSavedPlaceId: data.start.savedPlaceId ?? null,
      startAddress: data.start.address ?? null,
      startLatitude: data.start.latitude ?? null,
      startLongitude: data.start.longitude ?? null,
      startLabel: data.start.label ?? null,
      endType: data.end.type as TourEndpointType,
      endSavedPlaceId: data.end.savedPlaceId ?? null,
      endAddress: data.end.address ?? null,
      endLatitude: data.end.latitude ?? null,
      endLongitude: data.end.longitude ?? null,
      endLabel: data.end.label ?? null,
    },
  });

  const result = await recomputeAndPersistRoute(data.tourRunId);
  revalidatePath(TOURS_PATH);
  return result.degraded ? { ok: false, error: ROUTE_UNAVAILABLE_ERROR } : { ok: true };
}

const updateOptionsSchema = z.object({
  tourRunId: z.string().cuid(),
  safetyBufferMinutes: z.number().int().min(0).max(120),
  lunchBreakEnabled: z.boolean(),
  lunchBreakStart: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  lunchBreakEnd: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  optimizationPreference: z.enum(["TIME", "DISTANCE", "BALANCED"]),
  avoidTolls: z.boolean(),
  avoidHighways: z.boolean(),
  avoidFerries: z.boolean(),
});

export async function updateTourRunOptionsAction(input: z.infer<typeof updateOptionsSchema>): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = updateOptionsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: GENERIC_ERROR };
  const data = parsed.data;

  try {
    await requireOwnedTourRun(data.tourRunId, user.id);
  } catch {
    return { ok: false, error: GENERIC_ERROR };
  }

  await prisma.tourRun.update({
    where: { id: data.tourRunId },
    data: {
      safetyBufferMinutes: data.safetyBufferMinutes,
      lunchBreakEnabled: data.lunchBreakEnabled,
      lunchBreakStart: data.lunchBreakStart ?? null,
      lunchBreakEnd: data.lunchBreakEnd ?? null,
      optimizationPreference: data.optimizationPreference,
      avoidTolls: data.avoidTolls,
      avoidHighways: data.avoidHighways,
      avoidFerries: data.avoidFerries,
    },
  });

  const result = await recomputeAndPersistRoute(data.tourRunId);
  revalidatePath(TOURS_PATH);
  return result.degraded ? { ok: false, error: ROUTE_UNAVAILABLE_ERROR } : { ok: true };
}

export async function deleteTourRunAction(tourRunId: string): Promise<ActionResult> {
  const user = await requireUser();
  const parsedId = z.string().cuid().safeParse(tourRunId);
  if (!parsedId.success) return { ok: false, error: GENERIC_ERROR };

  try {
    await requireOwnedTourRun(parsedId.data, user.id);
  } catch {
    return { ok: false, error: GENERIC_ERROR };
  }

  await prisma.tourRun.delete({ where: { id: parsedId.data } });
  revalidatePath(TOURS_PATH);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Arrêts
// ---------------------------------------------------------------------------

async function nextStopOrder(tourRunId: string): Promise<number> {
  const last = await prisma.tourStop.findFirst({ where: { tourRunId }, orderBy: { order: "desc" } });
  return (last?.order ?? -1) + 1;
}

const addAppointmentStopsSchema = z.object({
  tourRunId: z.string().cuid(),
  appointmentIds: z.array(z.string().cuid()).min(1).max(50),
});

export async function addAppointmentStopsAction(input: z.infer<typeof addAppointmentStopsSchema>): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = addAppointmentStopsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: GENERIC_ERROR };
  const data = parsed.data;

  try {
    await requireOwnedTourRun(data.tourRunId, user.id);
  } catch {
    return { ok: false, error: GENERIC_ERROR };
  }

  const appointments = await prisma.appointment.findMany({ where: { id: { in: data.appointmentIds } } });
  if (appointments.length === 0) return { ok: false, error: GENERIC_ERROR };

  let order = await nextStopOrder(data.tourRunId);
  await prisma.tourStop.createMany({
    data: appointments.map((appointment) => ({
      tourRunId: data.tourRunId,
      appointmentId: appointment.id,
      order: order++,
      type: "APPOINTMENT" as TourStopType,
      // Snapshot au moment de l'ajout (voir doc) : label/adresse ne
      // suivront plus l'appointment si celui-ci change ensuite.
      label: `${appointment.animalName} — ${appointment.clientName}`,
      address: appointment.location,
      latitude: appointment.latitude,
      longitude: appointment.longitude,
      arrivalTime: appointment.start,
      serviceDurationMinutes: appointment.duration,
      // Un rendez-vous confirmé avec heure précise est fixe par défaut —
      // l'optimisation ne le déplace jamais sans validation explicite.
      locked: true,
      flexible: false,
    })),
  });

  const result = await recomputeAndPersistRoute(data.tourRunId);
  revalidatePath(TOURS_PATH);
  return result.degraded ? { ok: false, error: ROUTE_UNAVAILABLE_ERROR } : { ok: true };
}

const manualStopTypeSchema = z.enum(["BREAK", "MEAL", "CABINET", "HOME", "CLINIC", "STABLE", "SUPPLIER", "OTHER"]);

const addManualStopSchema = z.object({
  tourRunId: z.string().cuid(),
  type: manualStopTypeSchema,
  label: z.string().trim().min(1).max(100),
  address: z.string().max(300).nullable().optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  serviceDurationMinutes: z.number().int().min(0).max(480).nullable().optional(),
});

export async function addManualStopAction(input: z.infer<typeof addManualStopSchema>): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = addManualStopSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: GENERIC_ERROR };
  const data = parsed.data;

  try {
    await requireOwnedTourRun(data.tourRunId, user.id);
  } catch {
    return { ok: false, error: GENERIC_ERROR };
  }

  const order = await nextStopOrder(data.tourRunId);
  await prisma.tourStop.create({
    data: {
      tourRunId: data.tourRunId,
      order,
      type: data.type as TourStopType,
      label: data.label,
      address: data.address ?? null,
      latitude: data.latitude ?? null,
      longitude: data.longitude ?? null,
      serviceDurationMinutes: data.serviceDurationMinutes ?? null,
      flexible: true,
      locked: false,
    },
  });

  const result = await recomputeAndPersistRoute(data.tourRunId);
  revalidatePath(TOURS_PATH);
  return result.degraded ? { ok: false, error: ROUTE_UNAVAILABLE_ERROR } : { ok: true };
}

const updateStopSchema = z.object({
  tourRunId: z.string().cuid(),
  stopId: z.string().cuid(),
  // Un arrêt lié à un rendez-vous ne peut jamais voir son label/adresse
  // modifié ici (données client) — seuls flexible/locked/fenêtre/notes/durée
  // le sont. Un arrêt manuel accepte aussi label/address/coordonnées.
  label: z.string().trim().min(1).max(100).optional(),
  address: z.string().max(300).nullable().optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  serviceDurationMinutes: z.number().int().min(0).max(480).nullable().optional(),
  flexible: z.boolean().optional(),
  locked: z.boolean().optional(),
  timeWindowStart: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  timeWindowEnd: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

export async function updateStopAction(input: z.infer<typeof updateStopSchema>): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = updateStopSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: GENERIC_ERROR };
  const data = parsed.data;

  try {
    await requireOwnedTourRun(data.tourRunId, user.id);
  } catch {
    return { ok: false, error: GENERIC_ERROR };
  }

  const stop = await prisma.tourStop.findFirst({ where: { id: data.stopId, tourRunId: data.tourRunId } });
  if (!stop) return { ok: false, error: GENERIC_ERROR };

  const isManual = stop.appointmentId === null;

  await prisma.tourStop.update({
    where: { id: data.stopId },
    data: {
      ...(isManual && data.label !== undefined ? { label: data.label } : {}),
      ...(isManual && data.address !== undefined ? { address: data.address } : {}),
      ...(isManual && data.latitude !== undefined ? { latitude: data.latitude } : {}),
      ...(isManual && data.longitude !== undefined ? { longitude: data.longitude } : {}),
      // Phase 3 ter : la durée d'un arrêt lié à un rendez-vous vient du
      // rendez-vous lui-même — voir updateStopScheduleAction, seul chemin
      // pour la modifier dans ce cas (l'agenda reste la source de vérité).
      ...(isManual && data.serviceDurationMinutes !== undefined ? { serviceDurationMinutes: data.serviceDurationMinutes } : {}),
      ...(data.flexible !== undefined ? { flexible: data.flexible, locked: data.flexible ? false : stop.locked } : {}),
      ...(data.locked !== undefined ? { locked: data.locked } : {}),
      ...(data.timeWindowStart !== undefined ? { timeWindowStart: data.timeWindowStart } : {}),
      ...(data.timeWindowEnd !== undefined ? { timeWindowEnd: data.timeWindowEnd } : {}),
      ...(data.notes !== undefined ? { notes: data.notes } : {}),
    },
  });

  const result = await recomputeAndPersistRoute(data.tourRunId);
  revalidatePath(TOURS_PATH);
  return result.degraded ? { ok: false, error: ROUTE_UNAVAILABLE_ERROR } : { ok: true };
}

const updateStopScheduleSchema = z
  .object({
    tourRunId: z.string().cuid(),
    stopId: z.string().cuid(),
    start: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    durationMinutes: z.number().int().min(5).max(480).optional(),
  })
  .refine((value) => value.start !== undefined || value.durationMinutes !== undefined, { message: "empty" });

/**
 * Phase 3 ter : seul chemin pour changer l'heure ou la durée d'un arrêt.
 * L'agenda reste la source de vérité — un arrêt lié à un rendez-vous
 * repasse par saveAppointmentAction (mêmes contrôles de conflit et de
 * tampon de trajet que partout ailleurs) ; un arrêt manuel (sans
 * rendez-vous) écrit directement sur TourStop. Poser une heure explicite
 * verrouille l'arrêt (locked: true) — sinon le chaînage des horaires
 * (chainStopTimings) l'ignorerait au recalcul suivant, ce qui rendrait le
 * champ silencieusement sans effet.
 */
export async function updateStopScheduleAction(input: z.infer<typeof updateStopScheduleSchema>): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = updateStopScheduleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: GENERIC_ERROR };
  const data = parsed.data;

  try {
    await requireOwnedTourRun(data.tourRunId, user.id);
  } catch {
    return { ok: false, error: GENERIC_ERROR };
  }

  const stop = await prisma.tourStop.findFirst({
    where: { id: data.stopId, tourRunId: data.tourRunId },
    include: { appointment: true },
  });
  if (!stop) return { ok: false, error: GENERIC_ERROR };

  if (stop.appointmentId && stop.appointment) {
    const current = toAppointment({ ...stop.appointment, animal: null });
    const result = await saveAppointmentAction({
      id: current.id,
      date: current.date,
      start: data.start ?? current.start,
      duration: data.durationMinutes ?? current.duration,
      clientId: current.clientId ?? null,
      clientName: current.clientName,
      animalId: current.animalId ?? null,
      animalName: current.animalName,
      animalSpecies: current.animalSpecies ?? null,
      serviceName: current.serviceName,
      mode: current.mode,
      location: current.location,
      price: current.price,
      status: current.status,
      notes: current.notes,
      postalCode: current.postalCode,
      city: current.city,
      latitude: current.latitude,
      longitude: current.longitude,
    });
    if (!result.ok) return { ok: false, error: result.error };
  } else {
    await prisma.tourStop.update({
      where: { id: data.stopId },
      data: {
        ...(data.start !== undefined ? { arrivalTime: data.start } : {}),
        ...(data.durationMinutes !== undefined ? { serviceDurationMinutes: data.durationMinutes } : {}),
      },
    });
  }

  if (data.start !== undefined) {
    await prisma.tourStop.update({ where: { id: data.stopId }, data: { locked: true, flexible: false } });
  }

  const result = await recomputeAndPersistRoute(data.tourRunId);
  revalidatePath(TOURS_PATH);
  return result.degraded ? { ok: false, error: ROUTE_UNAVAILABLE_ERROR } : { ok: true };
}

const removeStopSchema = z.object({ tourRunId: z.string().cuid(), stopId: z.string().cuid() });

async function deleteStopAndReindex(tourRunId: string, stopId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.tourStop.delete({ where: { id: stopId } });
    const remaining = await tx.tourStop.findMany({ where: { tourRunId }, orderBy: { order: "asc" } });
    await Promise.all(remaining.map((remainingStop, index) => tx.tourStop.update({ where: { id: remainingStop.id }, data: { order: index } })));
  });
}

// Phase 3 ter : "retirer un arrêt" ne touche jamais le rendez-vous — il
// reste intact dans l'agenda, seule la tournée l'oublie. Pour annuler le
// vrai rendez-vous, voir cancelAppointmentAndRemoveStopAction ci-dessous :
// deux gestes distincts, jamais fusionnés dans un même bouton.
export async function removeStopAction(input: z.infer<typeof removeStopSchema>): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = removeStopSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: GENERIC_ERROR };
  const data = parsed.data;

  try {
    await requireOwnedTourRun(data.tourRunId, user.id);
  } catch {
    return { ok: false, error: GENERIC_ERROR };
  }

  const stop = await prisma.tourStop.findFirst({ where: { id: data.stopId, tourRunId: data.tourRunId } });
  if (!stop) return { ok: false, error: GENERIC_ERROR };

  await deleteStopAndReindex(data.tourRunId, data.stopId);

  const result = await recomputeAndPersistRoute(data.tourRunId);
  revalidatePath(TOURS_PATH);
  return result.degraded ? { ok: false, error: ROUTE_UNAVAILABLE_ERROR } : { ok: true };
}

/**
 * Phase 3 ter : "annuler le rendez-vous" — passe par
 * updateAppointmentStatusAction (même action que l'agenda : email de
 * suivi au client, synchronisation calendrier, tout ce qui accompagne
 * déjà une annulation ailleurs dans l'app), puis retire l'arrêt devenu
 * sans objet. Un rendez-vous annulé n'a plus sa place dans une tournée.
 */
const cancelStopAppointmentSchema = z.object({ tourRunId: z.string().cuid(), stopId: z.string().cuid() });

export async function cancelStopAppointmentAction(input: z.infer<typeof cancelStopAppointmentSchema>): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = cancelStopAppointmentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: GENERIC_ERROR };
  const data = parsed.data;

  try {
    await requireOwnedTourRun(data.tourRunId, user.id);
  } catch {
    return { ok: false, error: GENERIC_ERROR };
  }

  const stop = await prisma.tourStop.findFirst({ where: { id: data.stopId, tourRunId: data.tourRunId } });
  if (!stop || !stop.appointmentId) return { ok: false, error: GENERIC_ERROR };

  const cancelResult = await updateAppointmentStatusAction(stop.appointmentId, "cancelled");
  if (!cancelResult.ok) return { ok: false, error: cancelResult.error };

  await deleteStopAndReindex(data.tourRunId, data.stopId);

  const result = await recomputeAndPersistRoute(data.tourRunId);
  revalidatePath(TOURS_PATH);
  return result.degraded ? { ok: false, error: ROUTE_UNAVAILABLE_ERROR } : { ok: true };
}

const reorderStopsSchema = z.object({
  tourRunId: z.string().cuid(),
  orderedStopIds: z.array(z.string().cuid()).min(1).max(50),
  // Phase 3 ter : un réordonnancement ne doit jamais déplacer un rendez-vous
  // en silence. Un premier appel non confirmé ne fait qu'annoncer les
  // horaires proposés (needsConfirmation) ; l'utilisatrice les valide avant
  // qu'ils soient réellement appliqués aux rendez-vous.
  confirmed: z.boolean().optional(),
});

export type ReorderTimeChange = { stopId: string; label: string; currentTime: string; proposedTime: string };
export type ReorderResult = { ok: true } | { ok: false; error: string } | { ok: false; needsConfirmation: true; changes: ReorderTimeChange[]; orderedStopIds: string[] };

export async function reorderStopsAction(input: z.infer<typeof reorderStopsSchema>): Promise<ReorderResult> {
  const user = await requireUser();
  const parsed = reorderStopsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: GENERIC_ERROR };
  const data = parsed.data;

  let tourRun: DbTourRun;
  try {
    tourRun = await requireOwnedTourRun(data.tourRunId, user.id);
  } catch {
    return { ok: false, error: GENERIC_ERROR };
  }

  const stops = await prisma.tourStop.findMany({ where: { tourRunId: data.tourRunId }, include: { appointment: true } });
  const existingIds = new Set(stops.map((row) => row.id));
  const requestedIds = new Set(data.orderedStopIds);
  if (existingIds.size !== requestedIds.size || [...existingIds].some((id) => !requestedIds.has(id))) {
    return { ok: false, error: GENERIC_ERROR };
  }

  const stopById = new Map(stops.map((stop) => [stop.id, stop]));
  const orderedStops = data.orderedStopIds.map((id) => stopById.get(id)!);

  const proposedTimings = await computeTimingsForOrder(tourRun, orderedStops);
  const changes: ReorderTimeChange[] = [];
  for (const stop of orderedStops) {
    if (stop.locked || !stop.appointmentId || !stop.appointment) continue;
    const proposed = proposedTimings.get(stop.id);
    if (!proposed || proposed.arrivalTime === stop.appointment.start) continue;
    changes.push({ stopId: stop.id, label: stop.label, currentTime: stop.appointment.start, proposedTime: proposed.arrivalTime });
  }

  if (changes.length > 0 && !data.confirmed) {
    return { ok: false, needsConfirmation: true, changes, orderedStopIds: data.orderedStopIds };
  }

  // Les rendez-vous affectés sont synchronisés AVANT que l'ordre ne soit
  // persisté : si l'un d'eux est refusé (conflit détecté par
  // saveAppointmentAction), rien n'est modifié — ni les rendez-vous, ni
  // l'ordre des arrêts, message d'erreur affiché tel quel.
  for (const change of changes) {
    const stop = stopById.get(change.stopId)!;
    const current = toAppointment({ ...stop.appointment!, animal: null });
    const saved = await saveAppointmentAction({ ...current, start: change.proposedTime });
    if (!saved.ok) return { ok: false, error: saved.error };
  }

  // Deux passes (offset temporaire puis ordre final) pour ne jamais violer
  // la contrainte unique [tourRunId, order] pendant la transaction.
  await prisma.$transaction([
    ...data.orderedStopIds.map((stopId, index) => prisma.tourStop.update({ where: { id: stopId }, data: { order: 10000 + index } })),
    ...data.orderedStopIds.map((stopId, index) => prisma.tourStop.update({ where: { id: stopId }, data: { order: index } })),
  ]);

  const result = await recomputeAndPersistRoute(data.tourRunId);
  revalidatePath(TOURS_PATH);
  return result.degraded ? { ok: false, error: ROUTE_UNAVAILABLE_ERROR } : { ok: true };
}

export async function moveStopAction(input: { tourRunId: string; stopId: string; direction: "up" | "down"; confirmed?: boolean }): Promise<ReorderResult> {
  const user = await requireUser();
  const schema = z.object({ tourRunId: z.string().cuid(), stopId: z.string().cuid(), direction: z.enum(["up", "down"]), confirmed: z.boolean().optional() });
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: GENERIC_ERROR };
  const data = parsed.data;

  try {
    await requireOwnedTourRun(data.tourRunId, user.id);
  } catch {
    return { ok: false, error: GENERIC_ERROR };
  }

  const stops = await prisma.tourStop.findMany({ where: { tourRunId: data.tourRunId }, orderBy: { order: "asc" } });
  const index = stops.findIndex((stop) => stop.id === data.stopId);
  const swapWith = data.direction === "up" ? index - 1 : index + 1;
  if (index === -1 || swapWith < 0 || swapWith >= stops.length) return { ok: false, error: GENERIC_ERROR };

  const ordered = [...stops];
  [ordered[index], ordered[swapWith]] = [ordered[swapWith], ordered[index]];

  return reorderStopsAction({ tourRunId: data.tourRunId, orderedStopIds: ordered.map((stop) => stop.id), confirmed: data.confirmed });
}

// ---------------------------------------------------------------------------
// Recalcul manuel (bouton "Réessayer")
// ---------------------------------------------------------------------------

export async function recomputeRouteAction(tourRunId: string): Promise<ActionResult> {
  const user = await requireUser();
  const parsedId = z.string().cuid().safeParse(tourRunId);
  if (!parsedId.success) return { ok: false, error: GENERIC_ERROR };

  try {
    await requireOwnedTourRun(parsedId.data, user.id);
  } catch {
    return { ok: false, error: GENERIC_ERROR };
  }

  if (await isRateLimited(`tour-route:${user.id}`, 40, 5 * 60 * 1000)) {
    return { ok: false, error: "Trop de recalculs en peu de temps. Patientez un instant." };
  }
  await recordAttempt(`tour-route:${user.id}`);

  const result = await recomputeAndPersistRoute(parsedId.data);
  revalidatePath(TOURS_PATH);
  return result.degraded ? { ok: false, error: ROUTE_UNAVAILABLE_ERROR } : { ok: true };
}

// ---------------------------------------------------------------------------
// Optimisation — ne modifie jamais l'ordre réel, propose seulement.
// ---------------------------------------------------------------------------

export type OptimizationComparison = {
  current: { distanceMeters: number; durationSeconds: number };
  proposed: { distanceMeters: number; durationSeconds: number; order: string[] };
  unassigned: string[];
};

export type OptimizeResult = { ok: true; comparison: OptimizationComparison } | { ok: false; error: string };

export async function optimizeTourRunAction(tourRunId: string): Promise<OptimizeResult> {
  const user = await requireUser();
  const parsedId = z.string().cuid().safeParse(tourRunId);
  if (!parsedId.success) return { ok: false, error: GENERIC_ERROR };

  let tourRun;
  try {
    tourRun = await requireOwnedTourRun(parsedId.data, user.id);
  } catch {
    return { ok: false, error: GENERIC_ERROR };
  }

  if (await isRateLimited(`tour-optimize:${user.id}`, 15, 5 * 60 * 1000)) {
    return { ok: false, error: "Trop d'optimisations en peu de temps. Patientez un instant." };
  }
  await recordAttempt(`tour-optimize:${user.id}`);

  const stops = await prisma.tourStop.findMany({ where: { tourRunId: parsedId.data }, orderBy: { order: "asc" } });
  const savedPlaces = await listSavedPlaces(user.id);
  const { start, end } = await resolveTourEndpoints(tourRun, stops, savedPlaces);
  if (!start.coordinates || !end.coordinates) {
    return { ok: false, error: "Départ et arrivée doivent être localisés pour optimiser." };
  }

  const locatedStops = stops.filter((stop) => stop.latitude != null && stop.longitude != null);
  if (locatedStops.length < 2) {
    return { ok: false, error: "Il faut au moins 2 arrêts localisés pour optimiser." };
  }

  const preferences = await getOrCreateTourPreferences(user.id);
  const dayStartMinutes = timeToMinutes(tourRun.departureTime ?? preferences.workHoursStart);
  const dayEndMinutes = timeToMinutes(preferences.workHoursEnd);
  const dayBase = new Date(tourRun.date);
  dayBase.setUTCHours(0, 0, 0, 0);
  const epochOfMinutes = (minutes: number) => Math.floor(dayBase.getTime() / 1000) + minutes * 60;

  try {
    const optimization = await optimizeStopOrder(
      start.coordinates,
      end.coordinates,
      locatedStops.map((stop) => ({
        refId: stop.id,
        location: { lat: stop.latitude!, lng: stop.longitude! },
        serviceDurationSeconds: (stop.serviceDurationMinutes ?? 0) * 60,
        timeWindow: stop.locked && stop.arrivalTime
          ? { start: epochOfMinutes(timeToMinutes(stop.arrivalTime) - 15), end: epochOfMinutes(timeToMinutes(stop.arrivalTime) + 15) }
          : stop.timeWindowStart && stop.timeWindowEnd
            ? { start: epochOfMinutes(timeToMinutes(stop.timeWindowStart)), end: epochOfMinutes(timeToMinutes(stop.timeWindowEnd)) }
            : undefined,
      })),
      { start: epochOfMinutes(dayStartMinutes), end: epochOfMinutes(dayEndMinutes) },
    );

    // Distance/durée actuelles pour comparaison (même waypoints, ordre non
    // optimisé) — Matrix suffit, pas besoin d'un second Directions complet.
    const currentPoints = [start.coordinates, ...locatedStops.map((stop) => ({ lat: stop.latitude!, lng: stop.longitude! })), end.coordinates];
    let currentDistance = 0;
    let currentDuration = 0;
    try {
      const matrix = await computeMatrix(currentPoints);
      for (let i = 0; i < currentPoints.length - 1; i += 1) {
        currentDistance += matrix.distancesMeters[i][i + 1];
        currentDuration += matrix.durationsSeconds[i][i + 1];
      }
    } catch {
      for (let i = 0; i < currentPoints.length - 1; i += 1) currentDistance += haversineDistanceKm(currentPoints[i], currentPoints[i + 1]) * 1000 * 1.3;
      currentDuration = (currentDistance / 1000 / 60) * 3600;
    }

    const comparison: OptimizationComparison = {
      current: { distanceMeters: Math.round(currentDistance), durationSeconds: Math.round(currentDuration) },
      proposed: { distanceMeters: Math.round(optimization.totalDistanceMeters), durationSeconds: Math.round(optimization.totalDurationSeconds), order: optimization.order },
      unassigned: optimization.unassigned,
    };

    await prisma.tourRun.update({ where: { id: parsedId.data }, data: { lastOptimizationProposal: comparison as unknown as object } });
    revalidatePath(TOURS_PATH);
    return { ok: true, comparison };
  } catch {
    return { ok: false, error: "Impossible de calculer une proposition d'optimisation pour le moment." };
  }
}

export async function applyOptimizationProposalAction(tourRunId: string, confirmed?: boolean): Promise<ReorderResult> {
  const user = await requireUser();
  const parsedId = z.string().cuid().safeParse(tourRunId);
  if (!parsedId.success) return { ok: false, error: GENERIC_ERROR };

  let tourRun;
  try {
    tourRun = await requireOwnedTourRun(parsedId.data, user.id);
  } catch {
    return { ok: false, error: GENERIC_ERROR };
  }

  const proposal = tourRun.lastOptimizationProposal as unknown as OptimizationComparison | null;
  if (!proposal) return { ok: false, error: "Aucune proposition à appliquer." };

  const stops = await prisma.tourStop.findMany({ where: { tourRunId: parsedId.data }, orderBy: { order: "asc" } });
  const proposedFirst = proposal.proposed.order;
  const rest = stops.filter((stop) => !proposedFirst.includes(stop.id)).map((stop) => stop.id);
  const finalOrder = [...proposedFirst, ...rest];

  // Même garde-fou que le réordonnancement manuel (phase 3 ter) : appliquer
  // une proposition d'optimisation peut aussi décaler des rendez-vous
  // réels — la proposition (distance/durée) n'est PAS consommée tant que
  // ce second niveau de confirmation n'a pas eu lieu.
  const result = await reorderStopsAction({ tourRunId: parsedId.data, orderedStopIds: finalOrder, confirmed });
  if (!result.ok) return result;

  await prisma.tourRun.update({ where: { id: parsedId.data }, data: { lastOptimizationProposal: Prisma.DbNull } });
  revalidatePath(TOURS_PATH);
  return { ok: true };
}

export async function dismissOptimizationProposalAction(tourRunId: string): Promise<ActionResult> {
  const user = await requireUser();
  const parsedId = z.string().cuid().safeParse(tourRunId);
  if (!parsedId.success) return { ok: false, error: GENERIC_ERROR };

  try {
    await requireOwnedTourRun(parsedId.data, user.id);
  } catch {
    return { ok: false, error: GENERIC_ERROR };
  }

  await prisma.tourRun.update({ where: { id: parsedId.data }, data: { lastOptimizationProposal: Prisma.DbNull } });
  revalidatePath(TOURS_PATH);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Lieux favoris
// ---------------------------------------------------------------------------

const savedPlaceTypeSchema = z.enum(["CABINET", "HOME", "CLINIC", "STABLE", "OTHER"]);

const upsertSavedPlaceSchema = z.object({
  id: z.string().cuid().optional(),
  label: z.string().trim().min(1).max(100),
  type: savedPlaceTypeSchema,
  address: z.string().trim().min(1).max(300),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  isDefaultStart: z.boolean().optional(),
  isDefaultEnd: z.boolean().optional(),
});

export async function upsertSavedPlaceAction(input: z.infer<typeof upsertSavedPlaceSchema>): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = upsertSavedPlaceSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: GENERIC_ERROR };
  const data = parsed.data;

  if (data.isDefaultStart) await prisma.savedPlace.updateMany({ where: { userId: user.id }, data: { isDefaultStart: false } });
  if (data.isDefaultEnd) await prisma.savedPlace.updateMany({ where: { userId: user.id }, data: { isDefaultEnd: false } });

  if (data.id) {
    const existing = await prisma.savedPlace.findFirst({ where: { id: data.id, userId: user.id } });
    if (!existing) return { ok: false, error: GENERIC_ERROR };
    await prisma.savedPlace.update({
      where: { id: data.id },
      data: {
        label: data.label,
        type: data.type,
        address: data.address,
        latitude: data.latitude,
        longitude: data.longitude,
        ...(data.isDefaultStart !== undefined ? { isDefaultStart: data.isDefaultStart } : {}),
        ...(data.isDefaultEnd !== undefined ? { isDefaultEnd: data.isDefaultEnd } : {}),
      },
    });
  } else {
    await prisma.savedPlace.create({
      data: {
        userId: user.id,
        label: data.label,
        type: data.type,
        address: data.address,
        latitude: data.latitude,
        longitude: data.longitude,
        isDefaultStart: data.isDefaultStart ?? false,
        isDefaultEnd: data.isDefaultEnd ?? false,
      },
    });
  }

  revalidatePath(TOURS_PATH);
  revalidatePath("/dashboard/parametres");
  return { ok: true };
}

export async function deleteSavedPlaceAction(id: string): Promise<ActionResult> {
  const user = await requireUser();
  const parsedId = z.string().cuid().safeParse(id);
  if (!parsedId.success) return { ok: false, error: GENERIC_ERROR };

  const existing = await prisma.savedPlace.findFirst({ where: { id: parsedId.data, userId: user.id } });
  if (!existing) return { ok: false, error: GENERIC_ERROR };

  await prisma.savedPlace.delete({ where: { id: parsedId.data } });
  revalidatePath(TOURS_PATH);
  revalidatePath("/dashboard/parametres");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Réglages globaux (Réglages > Tournées)
// ---------------------------------------------------------------------------

const updatePreferencesSchema = z.object({
  defaultStartType: endpointTypeSchema,
  defaultStartSavedPlaceId: z.string().cuid().nullable().optional(),
  defaultEndType: endpointTypeSchema,
  defaultEndSavedPlaceId: z.string().cuid().nullable().optional(),
  returnToStart: z.boolean(),
  safetyBufferMinutes: z.number().int().min(0).max(120),
  lunchBreakEnabled: z.boolean(),
  lunchBreakStart: z.string().regex(/^\d{2}:\d{2}$/),
  lunchBreakEnd: z.string().regex(/^\d{2}:\d{2}$/),
  workHoursStart: z.string().regex(/^\d{2}:\d{2}$/),
  workHoursEnd: z.string().regex(/^\d{2}:\d{2}$/),
  optimizationPreference: z.enum(["TIME", "DISTANCE", "BALANCED"]),
  avoidTolls: z.boolean(),
  avoidHighways: z.boolean(),
  avoidFerries: z.boolean(),
});

export async function updateTourPreferencesAction(input: z.infer<typeof updatePreferencesSchema>): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = updatePreferencesSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: GENERIC_ERROR };
  const data = parsed.data;

  await prisma.tourPreferences.upsert({
    where: { userId: user.id },
    create: { userId: user.id, ...data },
    update: data,
  });

  revalidatePath("/dashboard/parametres");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Géocodage inverse — clic carte / déplacement de marker (arrêt manuel
// uniquement, jamais un arrêt lié à un rendez-vous, voir updateStopAction).
// ---------------------------------------------------------------------------

const reverseGeocodeSchema = z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) });

export type ReverseGeocodeActionResult = { ok: true; label: string; postcode: string | null; city: string | null } | { ok: false; error: string };

export async function reverseGeocodeAction(input: z.infer<typeof reverseGeocodeSchema>): Promise<ReverseGeocodeActionResult> {
  const user = await requireUser();
  const parsed = reverseGeocodeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: GENERIC_ERROR };

  if (await isRateLimited(`tour-reverse-geocode:${user.id}`, 60, 5 * 60 * 1000)) {
    return { ok: false, error: "Trop de requêtes en peu de temps." };
  }
  await recordAttempt(`tour-reverse-geocode:${user.id}`);

  const result = await reverseGeocode(parsed.data.latitude, parsed.data.longitude);
  if (!result) return { ok: false, error: "Adresse introuvable à cet endroit." };
  return { ok: true, label: result.label, postcode: result.postcode, city: result.city };
}
