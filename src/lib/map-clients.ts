import "server-only";
import { readDb } from "@/lib/organization";
import { formatFrenchDate } from "@/lib/format";
import type { AnimalSpecies } from "@/data/species";
import type { MapClientSummary } from "@/data/map-clients";

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
export async function getMapClientSummaries(): Promise<MapClientSummary[]> {
  const db = await readDb();
  const clients = await db.client.findMany({
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: {
      id: true,
      firstName: true,
      lastName: true,
      city: true,
      address: true,
      latitude: true,
      longitude: true,
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
          reminders: { where: { status: "DUE" }, take: 1, select: { id: true } },
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
    }));

    return {
      id: client.id,
      ownerName: `${client.firstName} ${client.lastName}`.trim(),
      city: client.city,
      address: client.address,
      animals,
      lastConsultation: lastConsultation ? formatFrenchDate(lastConsultation) : "Aucune consultation",
      nextReminder: nextReminder ? formatFrenchDate(nextReminder) : "-",
      dueForReminder: animals.some((animal) => animal.dueForReminder),
      coordinates: fromAddress ?? fromAppointment,
      positionSource: fromAddress ? "address" : fromAppointment ? "appointment" : null,
    };
  });
}
