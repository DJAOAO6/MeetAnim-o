import "server-only";
import { currentDb } from "@/lib/organization";
import type { AnimalPlaceKind, AnimalPlaceSummary } from "@/data/places";

/** Lieux de l'espace courant, par nom, avec leurs animaux et propriétaires. */
export async function getPlaces(): Promise<AnimalPlaceSummary[]> {
  const db = await currentDb();
  const places = await db.animalPlace.findMany({
    orderBy: { name: "asc" },
    include: {
      animals: {
        orderBy: { name: "asc" },
        select: { id: true, name: true, species: true, clientId: true, client: { select: { firstName: true, lastName: true } } },
      },
    },
  });
  return places.map((place) => ({
    id: place.id,
    name: place.name,
    kind: place.kind as AnimalPlaceKind,
    address: place.address,
    postalCode: place.postalCode ?? "",
    city: place.city,
    latitude: place.latitude,
    longitude: place.longitude,
    notes: place.notes,
    precision: place.geocodePrecision,
    animals: place.animals.map((animal) => ({
      id: animal.id,
      name: animal.name,
      species: animal.species,
      clientId: animal.clientId,
      ownerName: `${animal.client.firstName} ${animal.client.lastName}`.trim(),
    })),
  }));
}
