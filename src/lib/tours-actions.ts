"use server";

import { moduleOpen, requireModule } from "@/lib/module-access";
import { parisDateId } from "@/lib/paris-time";
import { revalidatePath } from "next/cache";
import { currentDb } from "@/lib/organization";
import { getCurrentUser, requireUser } from "@/lib/auth/dal";
import { hasPermission } from "@/lib/auth/permissions";
import { getPublicZones, getTours } from "@/lib/tours";
import { getPublicServices } from "@/lib/services-actions";
import { saveAppointmentAction } from "@/lib/appointments-actions";
import { computeTotalPrice, parseDateIdToLocalNoon } from "@/lib/booking-validation";
import { geocodeAddress } from "@/lib/maps/geocoding-provider";
import { tourRunsOnDate, weekdayLabelFor } from "@/lib/tour-schedule";
import type { City, Tour, Zone, ZoneSector } from "@/data/tours";
import type { Tour as DbTour, TourStartType as DbTourStartType, TourStatus as DbTourStatus } from "@/generated/prisma/client";

const dbTourStatus: Record<Tour["status"], DbTourStatus> = { Active: "ACTIVE", Inactive: "INACTIVE" };
const tourStatusLabel: Record<DbTourStatus, Tour["status"]> = { ACTIVE: "Active", INACTIVE: "Inactive" };
const dbTourStartType: Record<Tour["startType"], DbTourStartType> = { Cabinet: "CABINET", "Adresse personnalisée": "CUSTOM" };
const tourStartTypeLabel: Record<DbTourStartType, Tour["startType"]> = { CABINET: "Cabinet", CUSTOM: "Adresse personnalisée" };

/**
 * appointmentCount/consultationHours ne sont plus des colonnes (P2-25) :
 * recalculées depuis les vrais rendez-vous de la prochaine occurrence
 * (getTours(), déjà appelé pour toute la liste) plutôt que dupliquées ici.
 */
async function toTour(row: DbTour): Promise<Tour> {
  const db = await currentDb();
  const [tours, zoneLinks] = await Promise.all([
    getTours(),
    db.tour.findUnique({ where: { id: row.id }, select: { zones: { select: { id: true } } } }),
  ]);
  const computed = tours.find((tour) => tour.id === row.id);
  return {
    id: row.id,
    name: row.name,
    recurrence: row.recurrence as Tour["recurrence"],
    day: row.day,
    dateId: row.dateId ?? undefined,
    dateLabel: row.dateLabel,
    startTime: row.startTime,
    endTime: row.endTime,
    zoneId: row.zoneId,
    zoneIds: zoneLinks?.zones.map((zone) => zone.id) ?? [row.zoneId],
    status: tourStatusLabel[row.status],
    appointmentCount: computed?.appointmentCount ?? 0,
    estimatedDistanceKm: computed?.estimatedDistanceKm ?? null,
    estimatedDurationMinutes: computed?.estimatedDurationMinutes ?? null,
    unlocatedStopCount: computed?.unlocatedStopCount ?? 0,
    expectedReturnTime: computed?.expectedReturnTime ?? null,
    nextOccurrenceLabel: computed?.nextOccurrenceLabel ?? null,
    consultationHours: computed?.consultationHours ?? "0h",
    startType: tourStartTypeLabel[row.startType],
    startAddress: row.startAddress,
    startCoordinates: row.startLatitude != null && row.startLongitude != null ? { lat: row.startLatitude, lng: row.startLongitude } : null,
    maxStops: row.maxStops,
    note: row.note ?? "",
  };
}

async function revalidateToursPages() {
  revalidatePath("/dashboard/tournees");
  revalidatePath("/dashboard/carte");
  revalidatePath("/dashboard/parametres");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/agenda");
}

export type TourActionResult = { ok: true; tour: Tour } | { ok: false; error: string };

export type SaveTourInput = {
  id?: string;
  name: string;
  recurrence: Tour["recurrence"];
  day: string;
  // Ancre de récurrence (quinzaine/mois) ou date exacte (ponctuelle) — sans
  // objet pour "Toutes les semaines", qui n'en a jamais eu besoin.
  dateId?: string | null;
  startTime: string;
  endTime: string;
  zoneIds: string[];
  status: Tour["status"];
  startType: Tour["startType"];
  startAddress?: string | null;
  startLatitude?: number | null;
  startLongitude?: number | null;
  maxStops?: number | null;
  note?: string;
};

const recurrencesRequiringAnchor: Tour["recurrence"][] = ["Toutes les deux semaines", "Tous les mois", "Une seule fois"];

export async function saveTourAction(input: SaveTourInput): Promise<TourActionResult> {
  await requireModule("TOURS");
  const user = await requireUser();
  const db = await currentDb();
  if (!hasPermission(user, "MANAGE_PUBLIC_SETTINGS")) {
    return { ok: false, error: "Vous n'avez pas la permission de gérer les tournées." };
  }

  const name = input.name.trim();
  if (!name) return { ok: false, error: "Le nom de la tournée est requis." };

  const zoneIds = [...new Set(input.zoneIds)];
  if (zoneIds.length === 0) return { ok: false, error: "Sélectionnez au moins une zone." };
  const matchingZones = await db.zone.findMany({ where: { id: { in: zoneIds } } });
  if (matchingZones.length !== zoneIds.length) return { ok: false, error: "Une des zones sélectionnées n'existe plus." };

  const dateId = input.dateId?.trim() || null;
  if (recurrencesRequiringAnchor.includes(input.recurrence) && !dateId) {
    return { ok: false, error: input.recurrence === "Une seule fois" ? "Choisissez une date." : "Choisissez la date de la première occurrence." };
  }

  if (input.startType === "Adresse personnalisée" && !input.startAddress?.trim()) {
    return { ok: false, error: "Renseignez l'adresse de départ." };
  }

  const maxStops = input.maxStops != null && Number.isInteger(input.maxStops) && input.maxStops > 0 ? input.maxStops : null;

  const baseData = {
    name,
    recurrence: input.recurrence,
    day: input.day,
    dateId,
    startTime: input.startTime,
    endTime: input.endTime,
    // zoneId (relation simple historique) reste renseigné pour ne rien
    // casser côté existant — toujours la première zone sélectionnée.
    zoneId: zoneIds[0],
    status: dbTourStatus[input.status],
    startType: dbTourStartType[input.startType],
    startAddress: input.startType === "Adresse personnalisée" ? input.startAddress?.trim() || null : null,
    startLatitude: input.startType === "Adresse personnalisée" ? input.startLatitude ?? null : null,
    startLongitude: input.startType === "Adresse personnalisée" ? input.startLongitude ?? null : null,
    maxStops,
    note: input.note?.trim() || null,
  };

  // "set" (remplace tout le lien existant) n'a de sens qu'en modification ;
  // une création utilise "connect" (rien à remplacer sur un enregistrement
  // qui n'existe pas encore) — même distinction que saveZoneAction pour ses villes.
  const row = input.id
    ? await db.tour.update({ where: { id: input.id }, data: { ...baseData, zones: { set: zoneIds.map((id) => ({ id })) } } })
    : await db.tour.create({ data: { ...baseData, dateLabel: `${input.day} · prochaine occurrence`, zones: { connect: zoneIds.map((id) => ({ id })) } } });

  await revalidateToursPages();
  return { ok: true, tour: await toTour(row) };
}

export async function toggleTourStatusAction(id: string): Promise<TourActionResult> {
  await requireModule("TOURS");
  const user = await requireUser();
  const db = await currentDb();
  if (!hasPermission(user, "MANAGE_PUBLIC_SETTINGS")) {
    return { ok: false, error: "Vous n'avez pas la permission de gérer les tournées." };
  }

  const existing = await db.tour.findUnique({ where: { id } });
  if (!existing) return { ok: false, error: "Cette tournée n'existe plus." };

  const row = await db.tour.update({
    where: { id },
    data: { status: existing.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" },
  });

  await revalidateToursPages();
  return { ok: true, tour: await toTour(row) };
}

export type DeleteTourResult = { ok: true } | { ok: false; error: string };

/**
 * Une Tour n'a pas de relation en base vers Appointment (P2-25 : les arrêts
 * sont calculés à la lecture par correspondance zone/date, pas une clé
 * étrangère) — sa suppression ne touche donc jamais les rendez-vous
 * eux-mêmes, seulement le regroupement en tournée, quel que soit son statut
 * (active, inactive, passée ou à venir).
 */
export async function deleteTourAction(id: string): Promise<DeleteTourResult> {
  await requireModule("TOURS");
  const user = await requireUser();
  const db = await currentDb();
  if (!hasPermission(user, "MANAGE_PUBLIC_SETTINGS")) {
    return { ok: false, error: "Vous n'avez pas la permission de gérer les tournées." };
  }

  const existing = await db.tour.findUnique({ where: { id } });
  if (!existing) return { ok: false, error: "Cette tournée n'existe plus." };

  // Les journées déjà générées à partir de ce motif survivraient à sa
  // suppression (TourRun.template est en SetNull) : orphelines, elles
  // resteraient dans la liste sans que rien ne les explique, et surtout
  // l'index unique (templateId, date, userId) ne les couvrirait plus — deux
  // NULL n'étant jamais égaux en SQL, la génération suivante recréerait le
  // même lot, encore et encore.
  //
  // Seules partent les journées à venir et encore vides : une journée qui
  // porte des arrêts porte du travail, et une journée passée est de
  // l'historique. Ni l'une ni l'autre n'appartient à ce motif au point de
  // disparaître avec lui.
  const todayUtc = new Date(`${parisDateId()}T00:00:00.000Z`);
  await db.tourRun.deleteMany({
    where: { templateId: id, date: { gte: todayUtc }, stops: { none: {} } },
  });

  await db.tour.delete({ where: { id } });
  await revalidateToursPages();
  return { ok: true };
}

export type ZoneActionResult = { ok: true; zone: Zone } | { ok: false; error: string };

export type SaveZoneInput = { id?: string; name: string; cities: City[]; sector?: ZoneSector | null };

export async function saveZoneAction(input: SaveZoneInput): Promise<ZoneActionResult> {
  await requireModule("TOURS");
  const user = await requireUser();
  const db = await currentDb();
  if (!hasPermission(user, "MANAGE_PUBLIC_SETTINGS")) {
    return { ok: false, error: "Vous n'avez pas la permission de gérer les zones." };
  }

  const name = input.name.trim();
  if (!name) return { ok: false, error: "Le nom de la zone est requis." };

  // Zéro ville est accepté (ex. création en ligne d'une zone depuis le
  // sélecteur multi-zone du formulaire de tournée, par nom seul) — les
  // villes peuvent être ajoutées ensuite en modifiant la zone. Le formulaire
  // de gestion des zones lui-même impose toujours au moins une ligne
  // côté UI, cette relaxation ne change rien à son comportement.
  const cities = input.cities
    .map((city) => ({ name: city.name.trim(), postalCode: city.postalCode.trim() }))
    .filter((city) => city.name.length > 0 && city.postalCode.length > 0);

  // Le secteur ne vaut que complet : un centre sans rayon ne décrit rien.
  const sector = input.sector && Number.isFinite(input.sector.lat) && Number.isFinite(input.sector.lng) && input.sector.radiusKm > 0
    ? { centerLabel: input.sector.label.trim() || null, centerLatitude: input.sector.lat, centerLongitude: input.sector.lng, radiusKm: Math.round(input.sector.radiusKm) }
    : { centerLabel: null, centerLatitude: null, centerLongitude: null, radiusKm: null };

  // Une zone sans communes ET sans secteur ne correspond à aucune adresse :
  // elle s'enregistre sans rien dire, puis aucun rendez-vous ne s'y rattache
  // jamais, sans que rien ne l'explique. Mieux vaut le refuser tout de suite.
  if (cities.length === 0 && sector.radiusKm == null) {
    return { ok: false, error: "Décrivez la zone : au moins une commune, ou un secteur d'intervention (un lieu et un rayon)." };
  }

  // Les villes soumises n'ont pas d'id fiable côté client (ids temporaires
  // générés par le formulaire pour React) : on remplace systématiquement
  // tout le jeu de villes de la zone plutôt que de tenter un diff.
  const zone = input.id
    ? await db.$transaction(async (tx) => {
        await tx.city.deleteMany({ where: { zoneId: input.id } });
        return tx.zone.update({ where: { id: input.id }, data: { name, ...sector, cities: { create: cities } }, include: { cities: true } });
      })
    : await db.zone.create({ data: { name, ...sector, cities: { create: cities } }, include: { cities: true } });

  await revalidateToursPages();
  return {
    ok: true,
    zone: {
      id: zone.id,
      name: zone.name,
      cities: zone.cities.map((city) => ({ id: city.id, name: city.name, postalCode: city.postalCode })),
      sector: zone.radiusKm != null && zone.centerLatitude != null && zone.centerLongitude != null
        ? { label: zone.centerLabel ?? "", lat: zone.centerLatitude, lng: zone.centerLongitude, radiusKm: zone.radiusKm }
        : null,
    },
  };
}

export type DeleteZoneResult = { ok: true } | { ok: false; error: string };

export async function deleteZoneAction(id: string): Promise<DeleteZoneResult> {
  await requireModule("TOURS");
  const user = await requireUser();
  const db = await currentDb();
  if (!hasPermission(user, "MANAGE_PUBLIC_SETTINGS")) {
    return { ok: false, error: "Vous n'avez pas la permission de gérer les zones." };
  }

  try {
    await db.zone.delete({ where: { id } });
  } catch {
    // Contrainte de clé étrangère : une Tour référence encore cette zone
    // (Tour.zone n'a pas de cascade de suppression, par conception).
    return { ok: false, error: "Cette zone est utilisée par une tournée et ne peut pas être supprimée." };
  }

  await revalidateToursPages();
  return { ok: true };
}

/**
 * Une zone utilisée par au moins une tournée ne peut pas être supprimée
 * directement (contrainte de clé étrangère sur Tour.zoneId, par
 * conception — voir deleteZoneAction ci-dessus) : cette action réassigne
 * d'abord chaque tournée concernée vers une autre zone existante, puis
 * supprime la zone devenue orpheline. Ne touche jamais Service.zoneFees
 * (frais de déplacement, clé = nom de zone — hors périmètre de cette
 * refonte).
 */
export async function reassignAndDeleteZoneAction(zoneId: string, targetZoneId: string): Promise<DeleteZoneResult> {
  await requireModule("TOURS");
  const user = await requireUser();
  const db = await currentDb();
  if (!hasPermission(user, "MANAGE_PUBLIC_SETTINGS")) {
    return { ok: false, error: "Vous n'avez pas la permission de gérer les zones." };
  }
  if (zoneId === targetZoneId) return { ok: false, error: "Choisissez une zone de destination différente." };

  const targetZone = await db.zone.findUnique({ where: { id: targetZoneId } });
  if (!targetZone) return { ok: false, error: "La zone de destination n'existe plus." };

  const affectedTours = await db.tour.findMany({ where: { OR: [{ zoneId }, { zones: { some: { id: zoneId } } }] }, include: { zones: { select: { id: true } } } });

  await db.$transaction(async (tx) => {
    for (const tour of affectedTours) {
      const remainingZoneIds = tour.zones.map((zone) => zone.id).filter((id) => id !== zoneId);
      if (!remainingZoneIds.includes(targetZoneId)) remainingZoneIds.push(targetZoneId);
      await tx.tour.update({
        where: { id: tour.id },
        data: {
          zoneId: tour.zoneId === zoneId ? targetZoneId : tour.zoneId,
          zones: { set: remainingZoneIds.map((id) => ({ id })) },
        },
      });
    }
    await tx.zone.delete({ where: { id: zoneId } });
  });

  await revalidateToursPages();
  return { ok: true };
}

export type AddTourStopInput = {
  clientId: string;
  animalId: string;
  serviceId: string;
  date: string;
  start: string;
};

export type AddTourStopResult = { ok: true } | { ok: false; error: string };

/**
 * Ajoute un arrêt à une tournée : crée un vrai rendez-vous à domicile via
 * saveAppointmentAction (source unique de vérité), jamais une ligne dans
 * une table d'arrêts séparée — la tournée le récupère ensuite comme
 * n'importe quel autre arrêt (correspondance par zone/date, voir
 * computeTourOccurrence dans tours.ts). Le prix réutilise exactement le
 * calcul de la réservation publique (computeTotalPrice) plutôt que d'en
 * dupliquer une variante ici.
 */
export async function addTourStopAction(input: AddTourStopInput): Promise<AddTourStopResult> {
  await requireModule("TOURS");
  const user = await requireUser();
  const db = await currentDb();
  if (!hasPermission(user, "MANAGE_PUBLIC_SETTINGS")) {
    return { ok: false, error: "Vous n'avez pas la permission de gérer les tournées." };
  }

  const [client, animal, services, zones] = await Promise.all([
    db.client.findUnique({ where: { id: input.clientId } }),
    db.animal.findUnique({ where: { id: input.animalId } }),
    getPublicServices(),
    getPublicZones(),
  ]);
  if (!client) return { ok: false, error: "Ce client n'existe plus." };
  if (!animal || animal.clientId !== client.id) return { ok: false, error: "Cet animal n'existe plus." };
  const service = services.find((item) => item.id === input.serviceId);
  if (!service) return { ok: false, error: "Cette prestation n'existe plus." };
  if (!service.homeEnabled) return { ok: false, error: "Cette prestation n'est pas proposée à domicile." };

  const addressQuery = [client.address, client.city].filter(Boolean).join(", ");
  const geocoded = addressQuery ? await geocodeAddress(addressQuery) : null;
  const postalCode = geocoded?.postcode;
  const city = geocoded?.city ?? client.city;

  const price = computeTotalPrice(service, "home", zones, postalCode, city);

  const result = await saveAppointmentAction({
    date: input.date,
    start: input.start,
    duration: service.duration,
    clientId: client.id,
    clientName: `${client.firstName} ${client.lastName}`,
    animalId: animal.id,
    animalName: animal.name,
    animalSpecies: animal.species,
    serviceName: service.name,
    mode: "home",
    location: addressQuery || client.city || "Domicile",
    price,
    status: "confirmed",
    notes: "",
    postalCode,
    city,
    latitude: geocoded?.latitude,
    longitude: geocoded?.longitude,
  });
  if (!result.ok) return result;

  await revalidateToursPages();
  return { ok: true };
}

export type TourPatternMatch = {
  tourId: string;
  name: string;
  startTime: string;
  startType: Tour["startType"];
  startAddress: string | null;
  startLatitude: number | null;
  startLongitude: number | null;
};

/**
 * Unification des tournées, phase 2 : au moment de créer une nouvelle
 * journée, propose de reprendre les réglages d'un motif actif dont la date
 * choisie EST une occurrence — jamais appliqué automatiquement, seulement
 * proposé (voir NewTourDayModal). Simple lecture, pas de donnée sensible
 * (les motifs ne sont pas propres à un utilisateur) : requireUser() suffit,
 * pas de permission dédiée.
 */
export async function findTourPatternForDateAction(dateId: string): Promise<TourPatternMatch | null> {
  await requireModule("TOURS");
  await requireUser();
  const db = await currentDb();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateId)) return null;

  const tours = await db.tour.findMany({ where: { status: "ACTIVE" } });
  const weekday = weekdayLabelFor(parseDateIdToLocalNoon(dateId));
  const match = tours.find((tour) =>
    tourRunsOnDate({ day: tour.day, dateId: tour.dateId ?? undefined, recurrence: tour.recurrence as Tour["recurrence"] }, dateId, weekday),
  );
  if (!match) return null;

  return {
    tourId: match.id,
    name: match.name,
    startTime: match.startTime,
    startType: tourStartTypeLabel[match.startType],
    startAddress: match.startAddress,
    startLatitude: match.startLatitude,
    startLongitude: match.startLongitude,
  };
}

// ---------------------------------------------------------------------------
// Phase 3 quater (unification des tournées) : recherche unifiée — troisième
// source à côté de searchClientsAndAnimalsAction (clients/animaux) et
// searchPlaces (lieux). Une zone n'a pas de coordonnées propres (Zone/City
// n'en stockent pas) : un résultat zone ne permet donc jamais de recentrer
// une carte, contrairement à un client ou un lieu — cohérent avec "coordonnées
// éventuelles" dans le contrat unique demandé par le prompt.
// ---------------------------------------------------------------------------

export type ZoneSearchResult = {
  id: string;
  name: string;
  // Ville qui a fait matcher la zone, si ce n'est pas son nom — pour un
  // sous-libellé explicite ("Zone Rouen Nord · via Bois-Guillaume").
  matchedCity: string | null;
  cityCount: number;
};

export async function searchZonesAction(rawQuery: string): Promise<ZoneSearchResult[]> {
  if (!(await moduleOpen("TOURS"))) return [];
  // getCurrentUser (jamais requireUser) : une recherche en direct ne doit
  // jamais déclencher une redirection de session — même convention que
  // searchClientsAndAnimalsAction (client-search.ts).
  const user = await getCurrentUser();
  if (!user) return [];
  const db = await currentDb();

  const query = rawQuery.trim();
  if (query.length < 2) return [];

  const zones = await db.zone.findMany({
    where: {
      OR: [
        { name: { contains: query, mode: "insensitive" } },
        { cities: { some: { OR: [{ name: { contains: query, mode: "insensitive" } }, { postalCode: { contains: query } }] } } },
      ],
    },
    include: { cities: true },
    orderBy: { name: "asc" },
    take: 5,
  });

  const normalizedQuery = query.toLocaleLowerCase("fr-FR");
  return zones.map((zone): ZoneSearchResult => {
    const nameMatches = zone.name.toLocaleLowerCase("fr-FR").includes(normalizedQuery);
    const matchedCity = nameMatches ? null : zone.cities.find((city) => city.name.toLocaleLowerCase("fr-FR").includes(normalizedQuery) || city.postalCode.includes(query))?.name ?? null;
    return { id: zone.id, name: zone.name, matchedCity, cityCount: zone.cities.length };
  });
}
