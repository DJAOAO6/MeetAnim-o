import "server-only";
import { readDb } from "@/lib/organization";
import { formatFrenchDate } from "@/lib/format";
import { parisDateId } from "@/lib/paris-time";
import type { AnimalSpecies } from "@/data/species";
import type { MapAppointment, MapClientLocation, MapClientSummary } from "@/data/map-clients";

/**
 * Clients de la carte, un par propriétaire (et non plus un par animal : le
 * compteur disait « 46 clients » pour 27 propriétaires et 46 animaux).
 *
 * Une seule position par client, dans cet ordre :
 *  1. les coordonnées de l'adresse de la fiche client ;
 *  2. à défaut, le dernier rendez-vous à domicile géolocalisé, tous
 *     animaux confondus ;
 *  3. sinon aucune — le client reste listé « sans position », jamais placé
 *     au hasard.
 * Deux animaux d'un même propriétaire ne peuvent donc plus apparaître à
 * deux endroits. Les clients sans animal figurent aussi sur la carte.
 */
const dayMonthFormatter = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", timeZone: "UTC" });

export async function getMapClientSummaries(): Promise<MapClientSummary[]> {
  const db = await readDb();
  // Prochain rendez-vous de chaque client : une requête pour tous, le
  // premier par client dans l'ordre du calendrier.
  const todayId = parisDateId();
  const upcoming = await db.appointment.findMany({
    where: { clientId: { not: null }, status: { not: "CANCELLED" }, date: { gte: new Date(`${todayId}T00:00:00Z`) } },
    orderBy: [{ date: "asc" }, { start: "asc" }],
    select: { clientId: true, date: true, start: true },
  });
  const nextByClient = new Map<string, string>();
  for (const appointment of upcoming) {
    if (appointment.clientId && !nextByClient.has(appointment.clientId)) {
      nextByClient.set(appointment.clientId, `${dayMonthFormatter.format(appointment.date)} — ${appointment.start}`);
    }
  }
  const clients = await db.client.findMany({
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: {
      id: true,
      firstName: true,
      lastName: true,
      city: true,
      postalCode: true,
      phone: true,
      latitude: true,
      longitude: true,
      geocodePrecision: true,
      animals: {
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          species: true,
          breed: true,
          avatar: true,
          reminderDate: true,
          consultations: { orderBy: { date: "desc" }, take: 1, select: { date: true } },
          reminders: { where: { status: "DUE" }, select: { id: true } },
          place: { select: { id: true, name: true, city: true, postalCode: true, latitude: true, longitude: true, geocodePrecision: true } },
        },
      },
      appointments: {
        where: { mode: "DOMICILE", latitude: { not: null }, longitude: { not: null } },
        orderBy: { date: "desc" },
        take: 1,
        select: { latitude: true, longitude: true },
      },
    },
  });

  return clients.map((client): MapClientSummary => {
    const appointment = client.appointments[0];
    const fromAddress = client.latitude != null && client.longitude != null ? { lat: client.latitude, lng: client.longitude } : null;
    const fromAppointment = appointment?.latitude != null && appointment.longitude != null ? { lat: appointment.latitude, lng: appointment.longitude } : null;

    const lastConsultation = client.animals
      .map((animal) => animal.consultations[0]?.date)
      .filter((date): date is Date => Boolean(date))
      .sort((a, b) => b.getTime() - a.getTime())[0];
    const nextReminder = client.animals
      .map((animal) => animal.reminderDate)
      .filter((date): date is Date => Boolean(date))
      .sort((a, b) => a.getTime() - b.getTime())[0];

    const animals = client.animals.map((animal) => ({
      id: animal.id,
      name: animal.name,
      species: animal.species as AnimalSpecies,
      breed: animal.breed,
      avatar: animal.avatar,
      dueForReminder: animal.reminders.length > 0,
      placeName: animal.place?.name ?? null,
    }));

    // Emplacements (phase 8.9) : le domicile pour les animaux qui y vivent
    // (ou pour un client sans animal), un par lieu localisé pour les autres.
    // Un animal dont le lieu n'est pas localisé reste compté au domicile.
    const home = fromAddress ?? fromAppointment;
    const homeAnimalIds: string[] = [];
    const placeLocations = new Map<string, MapClientLocation>();
    for (const animal of client.animals) {
      const place = animal.place;
      if (place && place.latitude != null && place.longitude != null) {
        const location = placeLocations.get(place.id) ?? {
          key: `${client.id}@${place.id}`,
          placeId: place.id,
          placeName: place.name,
          city: place.city,
          postalCode: place.postalCode ?? "",
          coordinates: { lat: place.latitude, lng: place.longitude },
          animalIds: [],
        };
        location.animalIds.push(animal.id);
        placeLocations.set(place.id, location);
      } else homeAnimalIds.push(animal.id);
    }
    const locations: MapClientLocation[] = [
      ...(home && (homeAnimalIds.length > 0 || client.animals.length === 0)
        ? [{ key: client.id, placeId: null, placeName: null, city: client.city, postalCode: client.postalCode ?? "", coordinates: home, animalIds: homeAnimalIds }]
        : []),
      ...placeLocations.values(),
    ];
    const primary = locations[0] ?? null;
    const primaryPlace = primary?.placeId ? client.animals.find((animal) => animal.place?.id === primary.placeId)?.place : null;

    return {
      id: client.id,
      ownerName: `${client.firstName} ${client.lastName}`.trim(),
      city: client.city,
      postalCode: client.postalCode ?? "",
      phone: client.phone,
      animals,
      lastConsultation: lastConsultation ? formatFrenchDate(lastConsultation) : "Aucune consultation",
      lastConsultationAt: lastConsultation ? lastConsultation.toISOString().slice(0, 10) : null,
      nextAppointment: nextByClient.get(client.id) ?? null,
      nextReminder: nextReminder ? formatFrenchDate(nextReminder) : "-",
      dueForReminder: animals.some((animal) => animal.dueForReminder),
      dueReminderIds: client.animals.flatMap((animal) => animal.reminders.map((reminder) => reminder.id)),
      coordinates: primary?.coordinates ?? null,
      locations,
      positionSource: primaryPlace ? "place" : fromAddress ? "address" : fromAppointment ? "appointment" : null,
      // Précision connue pour une adresse géocodée (client ou lieu) ; pour un
      // rendez-vous, on ne sait pas (souvent une ville saisie à la main).
      precision: primaryPlace ? primaryPlace.geocodePrecision : fromAddress ? client.geocodePrecision : null,
    };
  });
}

/** Horizon du mode « Activité » : aujourd'hui, 7 ou 30 jours. */
export const MAP_ACTIVITY_DAYS = 30;

/**
 * Rendez-vous d'aujourd'hui aux 30 prochains jours (heure de Paris), hors
 * annulés, dans l'ordre du calendrier. Position : celle du rendez-vous à
 * domicile quand il en a une ; au cabinet, aucune (voir MapAppointment).
 */
export async function getMapAppointments(): Promise<MapAppointment[]> {
  const db = await readDb();
  const fromId = parisDateId();
  const toId = parisDateId(new Date(), MAP_ACTIVITY_DAYS - 1);
  const appointments = await db.appointment.findMany({
    where: { date: { gte: new Date(`${fromId}T00:00:00Z`), lte: new Date(`${toId}T00:00:00Z`) }, status: { not: "CANCELLED" } },
    orderBy: [{ date: "asc" }, { start: "asc" }],
    select: {
      id: true, date: true, start: true, clientId: true, clientName: true, animalName: true, animalSpecies: true,
      serviceName: true, city: true, location: true, mode: true, status: true, latitude: true, longitude: true,
      client: { select: { city: true } },
    },
  });
  return appointments.map((appointment): MapAppointment => ({
    id: appointment.id,
    dateId: appointment.date.toISOString().slice(0, 10),
    start: appointment.start,
    clientId: appointment.clientId,
    clientName: appointment.clientName,
    animalName: appointment.animalName,
    animalSpecies: (appointment.animalSpecies as AnimalSpecies | null) ?? null,
    serviceName: appointment.serviceName,
    city: appointment.city || appointment.client?.city || "",
    place: appointment.mode === "DOMICILE" ? "home" : "cabinet",
    status: appointment.status as MapAppointment["status"],
    coordinates: appointment.mode === "DOMICILE" && appointment.latitude != null && appointment.longitude != null
      ? { lat: appointment.latitude, lng: appointment.longitude }
      : null,
  }));
}
