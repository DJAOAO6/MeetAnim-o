import "server-only";
import { prisma } from "@/lib/db";
import { formatEuros, formatFrenchDate, initialsFor } from "@/lib/format";
import { getCurrentUser } from "@/lib/auth/dal";
import { logAudit } from "@/lib/audit";
import type { Animal, AnimalDocument, Client, ClientPickerOption, Consultation } from "@/data/clients";
import type {
  Animal as DbAnimal,
  AnimalDocument as DbAnimalDocument,
  Client as DbClient,
  Consultation as DbConsultation,
} from "@/generated/prisma/client";

const clientInclude = {
  animals: {
    include: {
      consultations: { orderBy: { date: "desc" as const } },
      documents: { orderBy: { createdAt: "desc" as const } },
    },
  },
};

type DbClientWithAnimals = DbClient & {
  animals: Array<DbAnimal & { consultations: DbConsultation[]; documents: DbAnimalDocument[] }>;
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

function mapAnimal(animal: DbAnimal & { consultations: DbConsultation[]; documents: DbAnimalDocument[] }): Animal {
  return {
    id: animal.id,
    name: animal.name,
    species: animal.species,
    breed: animal.breed,
    age: animal.age,
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
  };
}

function mapClient(client: DbClientWithAnimals): Client {
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
    address: client.address,
    status: client.status === "ACTIF" ? "Actif" : "Inactif",
    lastConsultation: lastConsultation ? formatFrenchDate(lastConsultation) : "Aucune consultation",
    createdAt: client.createdAt.toISOString(),
    animals: client.animals.map(mapAnimal),
  };
}

export async function getClients(): Promise<Client[]> {
  const clients = await prisma.client.findMany({
    include: clientInclude,
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

  return clients.map(mapClient);
}

/**
 * Version allégée de getClients(), sans consultations ni documents : sert
 * uniquement à alimenter le sélecteur de client/animal du formulaire de
 * rendez-vous, chargé sur chaque page du dashboard via le layout.
 */
export async function getClientPickerOptions(): Promise<ClientPickerOption[]> {
  const clients = await prisma.client.findMany({
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: {
      id: true,
      firstName: true,
      lastName: true,
      address: true,
      city: true,
      animals: { select: { id: true, name: true, species: true }, orderBy: { name: "asc" } },
    },
  });

  return clients;
}

export async function getClientById(id: string): Promise<Client | undefined> {
  const client = await prisma.client.findUnique({
    where: { id },
    include: clientInclude,
  });

  if (client) {
    const user = await getCurrentUser();
    await logAudit({ userId: user?.id, action: "CLIENT_VIEWED", entityType: "Client", entityId: client.id });
  }

  return client ? mapClient(client) : undefined;
}
