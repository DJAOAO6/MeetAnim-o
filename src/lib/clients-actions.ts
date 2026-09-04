"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser, requireUser } from "@/lib/auth/dal";
import { hasPermission } from "@/lib/auth/permissions";
import { logAudit } from "@/lib/audit";
import { clientInclude, mapAnimal, mapClient } from "@/lib/clients";
import { buildClientNameWordConditions, clientSearchQuerySchema, MAX_SEARCH_RESULTS_PER_GROUP } from "@/lib/client-search";
import { geocodeAddress } from "@/lib/geocoding";
import { avatarBackgroundFor, avatarForSpecies } from "@/data/animal-visuals";
import type { Animal, Client } from "@/data/clients";
import type { PublicAnimalType } from "@/data/public-booking";
import type { AnimalSpecies } from "@/data/species";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Géocode une fiche client en arrière-plan (after(), jamais dans le chemin
 * critique de l'enregistrement — une adresse introuvable ou l'API IGN
 * indisponible ne doit jamais empêcher de créer/modifier un client).
 * `geocodedAt` est posé dans tous les cas (succès ou échec, geocodeAddress
 * ne lève jamais) pour ne pas retenter en boucle à chaque page vue ; le
 * bouton "localiser" reste le rattrapage manuel explicite pour un échec.
 * Coordonnées effacées si le géocodage échoue : après un changement
 * d'adresse, mieux vaut "position inconnue" qu'une ancienne position
 * devenue fausse.
 */
async function geocodeClientInBackground(clientId: string, address: string, city: string): Promise<void> {
  const geocoded = await geocodeAddress(`${address}, ${city}`);
  await prisma.client.update({
    where: { id: clientId },
    data: { latitude: geocoded?.latitude ?? null, longitude: geocoded?.longitude ?? null, geocodedAt: new Date() },
  });
}

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

export type BulkDeleteClientsResult = { deletedIds: string[]; failedNames: string[] };

/**
 * Suppression groupée (bandeau de sélection façon Gmail, liste clients) —
 * même mécanique que sendRemindersBulkAction : chaque suppression est
 * indépendante (Promise.allSettled), l'échec d'une fiche ne doit jamais
 * bloquer les autres.
 */
export async function deleteClientsAction(clientIds: string[]): Promise<BulkDeleteClientsResult> {
  const user = await requireUser();
  if (!hasPermission(user, "DELETE_CLIENTS")) return { deletedIds: [], failedNames: [] };
  if (clientIds.length === 0) return { deletedIds: [], failedNames: [] };

  const clients = await prisma.client.findMany({ where: { id: { in: clientIds } }, select: { id: true, firstName: true, lastName: true } });

  const results = await Promise.allSettled(clients.map(async (client) => {
    await prisma.client.delete({ where: { id: client.id } });
    await logAudit({ userId: user.id, action: "CLIENT_DELETED", entityType: "Client", entityId: client.id });
    return client.id;
  }));

  const deletedIds: string[] = [];
  const failedNames: string[] = [];
  results.forEach((result, index) => {
    if (result.status === "fulfilled") deletedIds.push(result.value);
    else failedNames.push(`${clients[index].firstName} ${clients[index].lastName}`);
  });

  revalidatePath("/dashboard/clients");
  revalidatePath("/dashboard/carte");
  revalidatePath("/dashboard/rappels");

  return { deletedIds, failedNames };
}

export type ClientContactInput = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  city: string;
  postalCode: string;
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
    data: {
      firstName,
      lastName,
      phone: input.phone.trim(),
      email,
      city: input.city.trim(),
      postalCode: input.postalCode.trim() || null,
      address: input.address.trim(),
    },
    include: clientInclude,
  });
  await logAudit({ userId: user.id, action: "CLIENT_CREATED", entityType: "Client", entityId: created.id });

  if (created.address && created.city) {
    after(() => geocodeClientInBackground(created.id, created.address, created.city).catch(() => {}));
  }

  revalidatePath("/dashboard/clients");
  revalidatePath("/dashboard/carte");

  return { ok: true, client: mapClient(created) };
}

export async function updateClientAction(clientId: string, input: ClientContactInput): Promise<ClientResult> {
  const user = await requireUser();

  const existing = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true, address: true, city: true } });
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
      data: {
        firstName,
        lastName,
        phone: input.phone.trim(),
        email,
        city: input.city.trim(),
        postalCode: input.postalCode.trim() || null,
        address: input.address.trim(),
      },
      include: clientInclude,
    }),
    // Appointment.clientName est dénormalisé pour rester la seule source
    // d'affichage des rendez-vous « volants » sans clientId (AUDIT_COMPLET.md
    // P2-16) — donc pas remplaçable par une jointure, mais doit être
    // resynchronisé à chaque modification du client source.
    prisma.appointment.updateMany({ where: { clientId }, data: { clientName: fullName } }),
  ]);
  await logAudit({ userId: user.id, action: "CLIENT_UPDATED", entityType: "Client", entityId: clientId });

  // Re-géocode seulement si l'adresse a réellement changé — jamais à
  // chaque modification (téléphone, email…) qui n'a rien à voir avec la
  // position.
  if (updated.address !== existing.address || updated.city !== existing.city) {
    if (updated.address && updated.city) {
      after(() => geocodeClientInBackground(clientId, updated.address, updated.city).catch(() => {}));
    }
  }

  revalidatePath(`/dashboard/clients/${clientId}`);
  revalidatePath("/dashboard/clients");
  revalidatePath("/dashboard/carte");
  revalidatePath("/dashboard/agenda");
  revalidatePath("/dashboard");

  return { ok: true, client: mapClient(updated) };
}

// Unification des tournées, phase 3 bis : géocode l'adresse d'un client sans
// position (bouton "localiser" sous la carte tournées) — un rendez-vous à
// domicile déjà géolocalisé reste prioritaire (voir getMapClients), ce
// géocodage ne sert qu'aux clients qui n'en ont encore aucun.
export async function geocodeClientAddressAction(clientId: string): Promise<ClientActionResult> {
  await requireUser();

  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true, address: true, city: true } });
  if (!client) return { ok: false, error: "Client introuvable." };

  const geocoded = await geocodeAddress(`${client.address}, ${client.city}`);
  if (!geocoded) return { ok: false, error: "Adresse introuvable, vérifiez son orthographe." };

  await prisma.client.update({ where: { id: clientId }, data: { latitude: geocoded.latitude, longitude: geocoded.longitude, geocodedAt: new Date() } });

  revalidatePath("/dashboard/tournees");
  revalidatePath("/dashboard/carte");

  return { ok: true };
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
