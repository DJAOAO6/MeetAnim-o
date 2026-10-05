import "server-only";
import { animalAgeLabel } from "@/lib/animal-age";
import { cache } from "react";
import { currentDb } from "@/lib/organization";
import { formatEuros, formatFrenchDate, initialsFor } from "@/lib/format";
import { getCurrentUser } from "@/lib/auth/dal";
import { logAudit } from "@/lib/audit";
import type { Animal, AnimalDocument, Client, ClientPickerOption, Consultation } from "@/data/clients";
import type { AnimalPlaceKind } from "@/data/places";
import type {
  Animal as DbAnimal,
  AnimalDocument as DbAnimalDocument,
  Client as DbClient,
  Consultation as DbConsultation,
} from "@/generated/prisma/client";

export const clientInclude = {
  animals: {
    orderBy: { name: "asc" as const },
    include: {
      consultations: { orderBy: { date: "desc" as const } },
      documents: { orderBy: { createdAt: "desc" as const } },
      place: { select: { id: true, name: true, kind: true, city: true } },
    },
  },
};

type DbPlaceRef = { id: string; name: string; kind: string; city: string } | null;

type DbClientWithAnimals = DbClient & {
  animals: Array<DbAnimal & { consultations: DbConsultation[]; documents: DbAnimalDocument[]; place?: DbPlaceRef }>;
};

function mapConsultation(consultation: DbConsultation): Consultation {
  return {
    id: consultation.id,
    date: formatFrenchDate(consultation.date),
    service: consultation.service,
    mode: consultation.mode === "CABINET" ? "Cabinet" : "Domicile",
    price: formatEuros(consultation.price),
    summary: consultation.summary,
    status: consultation.status === "TERMINE" ? "Terminé" : "Annulé",
  };
}

function mapDocument(document: DbAnimalDocument): AnimalDocument {
  return {
    id: document.id,
    name: document.name,
    type: document.type === "PDF" ? "PDF" : "Image",
    linkedTo: document.linkedTo,
  };
}

export function mapAnimal(animal: DbAnimal & { consultations: DbConsultation[]; documents: DbAnimalDocument[]; place?: DbPlaceRef }): Animal {
  return {
    id: animal.id,
    name: animal.name,
    species: animal.species,
    breed: animal.breed,
    age: animalAgeLabel(animal),
    ageText: animal.age,
    birthDate: animal.birthDate ? animal.birthDate.toISOString().slice(0, 10) : null,
    birthDateApproximate: animal.birthDateApproximate,
    weight: animal.weight,
    sex: animal.sex,
    avatar: animal.avatar,
    avatarBackground: animal.avatarBackground,
    photo: animal.photo ?? undefined,
    history: animal.history,
    conditions: animal.conditions,
    treatments: animal.treatments,
    notes: animal.notes,
    reminder: {
      label: animal.reminderLabel ?? "Aucun rappel programmé",
      date: animal.reminderDate ? formatFrenchDate(animal.reminderDate) : "-",
    },
    consultations: animal.consultations.map(mapConsultation),
    documents: animal.documents.map(mapDocument),
    place: animal.place ? { id: animal.place.id, name: animal.place.name, kind: animal.place.kind as AnimalPlaceKind, city: animal.place.city } : null,
  };
}

export function mapClient(client: DbClientWithAnimals): Client {
  const consultationDates = client.animals.flatMap((animal) => animal.consultations.map((consultation) => consultation.date));
  const lastConsultation = consultationDates.length > 0 ? new Date(Math.max(...consultationDates.map((date) => date.getTime()))) : null;

  return {
    id: client.id,
    firstName: client.firstName,
    lastName: client.lastName,
    initials: initialsFor(client.firstName, client.lastName),
    phone: client.phone,
    email: client.email,
    city: client.city,
    postalCode: client.postalCode ?? "",
    address: client.address,
    status: client.status === "ACTIF" ? "Actif" : "Inactif",
    lastConsultation: lastConsultation ? formatFrenchDate(lastConsultation) : "Aucune consultation",
    createdAt: client.createdAt.toISOString(),
    animals: client.animals.map(mapAnimal),
  };
}

export async function getClients(): Promise<Client[]> {
  const db = await currentDb();
  const clients = await db.client.findMany({
    include: clientInclude,
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

  return clients.map(mapClient);
}

/**
 * Version allégée de getClients(), sans consultations ni documents : sert
 * uniquement à alimenter le sélecteur de client/animal du formulaire de
 * rendez-vous, chargé sur chaque page du dashboard via le layout — mais
 * aussi rechargé par certaines pages (agenda) qui en ont besoin dès le
 * rendu serveur. cache() déduplique ces deux lectures sur une même requête.
 */
export const getClientPickerOptions = cache(async (): Promise<ClientPickerOption[]> => {
  const db = await currentDb();
  const clients = await db.client.findMany({
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: {
      id: true,
      firstName: true,
      lastName: true,
      address: true,
      city: true,
      phone: true,
      email: true,
      animals: {
        select: {
          id: true, name: true, species: true, breed: true, age: true, birthDate: true, birthDateApproximate: true,
          place: { select: { id: true, name: true, kind: true, city: true, address: true, postalCode: true, latitude: true, longitude: true } },
        },
        orderBy: { name: "asc" },
      },
    },
  });

  return clients.map((client) => ({
    ...client,
    animals: client.animals.map(({ birthDate, birthDateApproximate, ...animal }) => ({
      ...animal,
      age: animalAgeLabel({ age: animal.age, birthDate, birthDateApproximate }),
      place: animal.place ? { ...animal.place, kind: animal.place.kind as AnimalPlaceKind, postalCode: animal.place.postalCode ?? "" } : null,
    })),
  }));
});

export async function getClientById(id: string): Promise<Client | undefined> {
  const db = await currentDb();
  const client = await db.client.findUnique({
    where: { id },
    include: clientInclude,
  });

  if (client) {
    const user = await getCurrentUser();
    await logAudit({ userId: user?.id, action: "CLIENT_VIEWED", entityType: "Client", entityId: client.id });
  }

  return client ? mapClient(client) : undefined;
}
