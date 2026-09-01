"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getCurrentUser, requireUser } from "@/lib/auth/dal";
import { hasPermission } from "@/lib/auth/permissions";
import { logAudit } from "@/lib/audit";
import { clientInclude, mapAnimal, mapClient } from "@/lib/clients";
import { buildClientNameWordConditions, clientSearchQuerySchema, MAX_SEARCH_RESULTS_PER_GROUP } from "@/lib/client-search";
import { avatarBackgroundFor, avatarForSpecies } from "@/data/animal-visuals";
import type { Animal, Client } from "@/data/clients";
import type { PublicAnimalType } from "@/data/public-booking";
import type { AnimalSpecies } from "@/data/species";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ClientActionResult = { ok: true } | { ok: false; error: string };

export async function deleteClientAction(clientId: string): Promise<ClientActionResult> {
  const user = await requireUser();
  if (!hasPermission(user, "DELETE_CLIENTS")) {
    return { ok: false, error: "Vous n'avez pas la permission de supprimer des clients." };
  }

  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true } });
  if (!client) return { ok: false, error: "Client introuvable." };

  await prisma.client.delete({ where: { id: clientId } });
  await logAudit({ userId: user.id, action: "CLIENT_DELETED", entityType: "Client", entityId: clientId });

  revalidatePath("/dashboard/clients");
  revalidatePath("/dashboard/carte");
  revalidatePath("/dashboard/rappels");

  return { ok: true };
}

export type ClientContactInput = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  city: string;
  address: string;
};

export type ClientResult = { ok: true; client: Client } | { ok: false; error: string };

export async function createClientAction(input: ClientContactInput): Promise<ClientResult> {
  const user = await requireUser();

  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  if (!firstName || !lastName) return { ok: false, error: "Le prénom et le nom sont obligatoires." };
  const email = input.email.trim();
  if (email && !emailPattern.test(email)) return { ok: false, error: "Email invalide." };

  const created = await prisma.client.create({
    data: { firstName, lastName, phone: input.phone.trim(), email, city: input.city.trim(), address: input.address.trim() },
    include: clientInclude,
  });
  await logAudit({ userId: user.id, action: "CLIENT_CREATED", entityType: "Client", entityId: created.id });

  revalidatePath("/dashboard/clients");
  revalidatePath("/dashboard/carte");

  return { ok: true, client: mapClient(created) };
}

export async function updateClientAction(clientId: string, input: ClientContactInput): Promise<ClientResult> {
  const user = await requireUser();

  const existing = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true } });
  if (!existing) return { ok: false, error: "Client introuvable." };

  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  if (!firstName || !lastName) return { ok: false, error: "Le prénom et le nom sont obligatoires." };
  const email = input.email.trim();
  if (email && !emailPattern.test(email)) return { ok: false, error: "Email invalide." };

  const fullName = `${firstName} ${lastName}`;
  const [updated] = await prisma.$transaction([
    prisma.client.update({
      where: { id: clientId },
      data: { firstName, lastName, phone: input.phone.trim(), email, city: input.city.trim(), address: input.address.trim() },
      include: clientInclude,
    }),
    // Appointment.clientName est dénormalisé pour rester la seule source
    // d'affichage des rendez-vous « volants » sans clientId (AUDIT_COMPLET.md
    // P2-16) — donc pas remplaçable par une jointure, mais doit être
    // resynchronisé à chaque modification du client source.
    prisma.appointment.updateMany({ where: { clientId }, data: { clientName: fullName } }),
  ]);
  await logAudit({ userId: user.id, action: "CLIENT_UPDATED", entityType: "Client", entityId: clientId });

  revalidatePath(`/dashboard/clients/${clientId}`);
  revalidatePath("/dashboard/clients");
  revalidatePath("/dashboard/carte");
  revalidatePath("/dashboard/agenda");
  revalidatePath("/dashboard");

  return { ok: true, client: mapClient(updated) };
}

export type UpdateAnimalInput = {
  name: string;
  species: string;
  breed: string;
  age: string;
  weight: string;
  sex: string;
  history: string;
  conditions: string;
  treatments: string;
  notes: string;
};

export async function updateAnimalAction(animalId: string, input: UpdateAnimalInput): Promise<ClientActionResult> {
  const user = await requireUser();

  const animal = await prisma.animal.findUnique({ where: { id: animalId }, select: { id: true, clientId: true } });
  if (!animal) return { ok: false, error: "Animal introuvable." };

  const name = input.name.trim();
  if (!name) return { ok: false, error: "Le nom de l’animal est obligatoire." };

  await prisma.$transaction([
    prisma.animal.update({ where: { id: animalId }, data: { ...input, name } }),
    prisma.appointment.updateMany({ where: { animalId }, data: { animalName: name } }),
  ]);
  await logAudit({ userId: user.id, action: "ANIMAL_UPDATED", entityType: "Animal", entityId: animalId, metadata: { clientId: animal.clientId } });

  revalidatePath(`/dashboard/clients/${animal.clientId}`);
  revalidatePath("/dashboard/clients");
  revalidatePath("/dashboard/rappels");
  revalidatePath("/dashboard/agenda");
  revalidatePath("/dashboard");

  return { ok: true };
}

export type AnimalResult = { ok: true; animal: Animal } | { ok: false; error: string };

export async function createAnimalAction(clientId: string, input: UpdateAnimalInput): Promise<AnimalResult> {
  const user = await requireUser();

  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true } });
  if (!client) return { ok: false, error: "Client introuvable." };

  const name = input.name.trim();
  if (!name) return { ok: false, error: "Le nom de l’animal est obligatoire." };
  const species = input.species.trim() || "Chien";

  const created = await prisma.animal.create({
    data: {
      ...input,
      clientId,
      name,
      species,
      // Le champ espèce est un texte libre en base, mais le sélecteur du
      // formulaire ne propose que les 5 valeurs de animalSpeciesList — même
      // hypothèse que findOrCreateClientAndAnimal() dans appointments-actions.ts.
      avatar: avatarForSpecies(species as PublicAnimalType),
      avatarBackground: avatarBackgroundFor(`${clientId}-${name}`),
    },
    include: { consultations: { orderBy: { date: "desc" } }, documents: { orderBy: { createdAt: "desc" } } },
  });
  // Pas de valeur d'audit dédiée à la création d'un animal (schéma existant) :
  // ANIMAL_UPDATED reste la valeur la plus proche disponible sans migration.
  await logAudit({ userId: user.id, action: "ANIMAL_UPDATED", entityType: "Animal", entityId: created.id, metadata: { clientId, created: true } });

  revalidatePath(`/dashboard/clients/${clientId}`);
  revalidatePath("/dashboard/clients");
  revalidatePath("/dashboard/carte");

  return { ok: true, animal: mapAnimal(created) };
}

export async function deleteAnimalAction(animalId: string): Promise<ClientActionResult> {
  const user = await requireUser();
  if (!hasPermission(user, "DELETE_CLIENTS")) {
    return { ok: false, error: "Vous n'avez pas la permission de supprimer un animal." };
  }

  const animal = await prisma.animal.findUnique({ where: { id: animalId }, select: { id: true, clientId: true, name: true } });
  if (!animal) return { ok: false, error: "Animal introuvable." };

  await prisma.animal.delete({ where: { id: animalId } });
  await logAudit({ userId: user.id, action: "ANIMAL_DELETED", entityType: "Animal", entityId: animalId, metadata: { clientId: animal.clientId, name: animal.name } });

  revalidatePath(`/dashboard/clients/${animal.clientId}`);
  revalidatePath("/dashboard/clients");
  revalidatePath("/dashboard/carte");
  revalidatePath("/dashboard/rappels");

  return { ok: true };
}

export type ClientSearchResult = { id: string; firstName: string; lastName: string; address: string; city: string };
export type AnimalSearchResult = { id: string; name: string; species: AnimalSpecies; clientId: string; ownerName: string; city: string };
export type ClientAndAnimalSearch = { clients: ClientSearchResult[]; animals: AnimalSearchResult[] };

/**
 * Recherche unifiée (carte clients, future palette CTRL+K) : deux requêtes
 * Postgres indépendantes (ILIKE via Prisma `contains`/`mode: "insensitive"`),
 * jamais de moteur de recherche externe à cette échelle. Une chaîne trop
 * courte ou invalide renvoie simplement des groupes vides plutôt qu'une
 * erreur — la saisie en cours n'a pas à être bloquante.
 */
export async function searchClientsAndAnimalsAction(rawQuery: string): Promise<ClientAndAnimalSearch> {
  const user = await getCurrentUser();
  if (!user) return { clients: [], animals: [] };

  const parsed = clientSearchQuerySchema.safeParse(rawQuery);
  if (!parsed.success) return { clients: [], animals: [] };

  const [clients, animals] = await Promise.all([
    prisma.client.findMany({
      where: { AND: buildClientNameWordConditions(parsed.data) },
      select: { id: true, firstName: true, lastName: true, address: true, city: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      take: MAX_SEARCH_RESULTS_PER_GROUP,
    }),
    prisma.animal.findMany({
      where: { name: { contains: parsed.data, mode: "insensitive" } },
      select: { id: true, name: true, species: true, clientId: true, client: { select: { firstName: true, lastName: true, city: true } } },
      orderBy: { name: "asc" },
      take: MAX_SEARCH_RESULTS_PER_GROUP,
    }),
  ]);

  return {
    clients,
    animals: animals.map((animal): AnimalSearchResult => ({
      id: animal.id,
      name: animal.name,
      species: animal.species as AnimalSpecies,
      clientId: animal.clientId,
      ownerName: `${animal.client.firstName} ${animal.client.lastName}`,
      city: animal.client.city,
    })),
  };
}
