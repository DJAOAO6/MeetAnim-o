"use server";

import { firstAnimalError, validateAnimal, type AnimalFieldErrors, type ValidAnimal } from "@/lib/animal-validation";
import { animalDeletedMetadata } from "@/lib/audit-metadata";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { dbFor } from "@/lib/db";
import { currentDb } from "@/lib/organization";
import { getCurrentUser, requireUser } from "@/lib/auth/dal";
import { hasPermission } from "@/lib/auth/permissions";
import { logAudit } from "@/lib/audit";
import { clientInclude, mapAnimal, mapClient } from "@/lib/clients";
import { clientSearchQuerySchema, rankClientsAndAnimals } from "@/lib/client-search";
import { MAX_ARCHIVE_BATCH, type UpcomingAppointments } from "@/lib/client-archive";
import { geocodeClientAddress, type PreciseGeocode } from "@/lib/geocoding";
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
async function geocodeClientInBackground(organizationId: string, clientId: string, address: string, city: string, postalCode: string | null): Promise<void> {
  const geocoded = await geocodeClientAddress({ address, city, postalCode });
  // after() s'exécute une fois la réponse envoyée : la session n'est plus
  // lisible, l'espace est donc passé par l'appelant.
  await dbFor(organizationId).client.update({ where: { id: clientId }, data: positionData(geocoded) });
}

/** Position à enregistrer : trouvée (avec sa précision), ou effacée. */
function positionData(geocoded: PreciseGeocode | null) {
  return {
    latitude: geocoded?.latitude ?? null,
    longitude: geocoded?.longitude ?? null,
    geocodePrecision: geocoded?.precision ?? null,
    geocodedAt: new Date(),
  };
}

export type ClientActionResult = { ok: true } | { ok: false; error: string };

export async function deleteClientAction(clientId: string): Promise<ClientActionResult> {
  const user = await requireUser();
  if (!hasPermission(user, "DELETE_CLIENTS")) {
    return { ok: false, error: "Vous n'avez pas la permission de supprimer des clients." };
  }
  const db = await currentDb();

  const client = await db.client.findUnique({ where: { id: clientId }, select: { id: true } });
  if (!client) return { ok: false, error: "Client introuvable." };

  await db.client.delete({ where: { id: clientId } });
  await logAudit({ userId: user.id, action: "CLIENT_DELETED", entityType: "Client", entityId: clientId });

  revalidatePath("/dashboard/clients");
  revalidatePath("/dashboard/carte");
  revalidatePath("/dashboard/rappels");

  return { ok: true };
}

export type ClientArchiveResult = { ok: true; ids: string[] } | { ok: false; error: string };

/** Rendez-vous à venir (confirmés ou en attente) de ces clients, pour la confirmation d'archivage. */
export async function upcomingAppointmentsOfClientsAction(clientIds: string[]): Promise<UpcomingAppointments[]> {
  await requireUser();
  const db = await currentDb();
  const ids = clientIds.slice(0, MAX_ARCHIVE_BATCH);
  if (ids.length === 0) return [];
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const [clients, counts] = await Promise.all([
    db.client.findMany({ where: { id: { in: ids } }, select: { id: true, firstName: true, lastName: true } }),
    db.appointment.groupBy({ by: ["clientId"], where: { clientId: { in: ids }, status: { in: ["CONFIRMED", "PENDING"] }, date: { gte: today } }, _count: { _all: true } }),
  ]);
  const countOf = new Map(counts.map((row) => [row.clientId, row._count._all]));
  return clients.map((client) => ({ name: `${client.firstName} ${client.lastName}`.trim(), count: countOf.get(client.id) ?? 0 }));
}

/**
 * Archive des clients : ils sortent de la liste courante, de la recherche,
 * du sélecteur de rendez-vous, de la carte et des relances. Rien n'est
 * supprimé, aucun rendez-vous n'est annulé ; restoreClientsAction les
 * ramène. Ouvert à tout membre de l'espace : c'est réversible.
 */
export async function archiveClientsAction(clientIds: string[]): Promise<ClientArchiveResult> {
  return setClientsArchived(clientIds, true);
}

export async function restoreClientsAction(clientIds: string[]): Promise<ClientArchiveResult> {
  return setClientsArchived(clientIds, false);
}

async function setClientsArchived(clientIds: string[], archived: boolean): Promise<ClientArchiveResult> {
  const user = await requireUser();
  const db = await currentDb();
  const ids = [...new Set(clientIds)].slice(0, MAX_ARCHIVE_BATCH);
  if (ids.length === 0) return { ok: false, error: "Aucun client sélectionné." };

  // Seulement ceux qui changent d'état : archiver deux fois ne réécrit pas la date.
  const targets = await db.client.findMany({ where: { id: { in: ids }, archivedAt: archived ? null : { not: null } }, select: { id: true } });
  const changed = targets.map((client) => client.id);
  if (changed.length > 0) {
    await db.client.updateMany({ where: { id: { in: changed } }, data: { archivedAt: archived ? new Date() : null } });
    for (const id of changed) {
      await logAudit({ userId: user.id, action: archived ? "CLIENT_ARCHIVED" : "CLIENT_RESTORED", entityType: "Client", entityId: id });
    }
  }

  revalidatePath("/dashboard", "layout");
  return { ok: true, ids: changed };
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
  const db = await currentDb();
  if (clientIds.length === 0) return { deletedIds: [], failedNames: [] };

  const clients = await db.client.findMany({ where: { id: { in: clientIds } }, select: { id: true, firstName: true, lastName: true } });

  const results = await Promise.allSettled(clients.map(async (client) => {
    await db.client.delete({ where: { id: client.id } });
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
  const db = await currentDb();

  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  if (!firstName || !lastName) return { ok: false, error: "Le prénom et le nom sont obligatoires." };
  const email = input.email.trim();
  if (email && !emailPattern.test(email)) return { ok: false, error: "Email invalide." };

  const created = await db.client.create({
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
    after(() => geocodeClientInBackground(created.organizationId, created.id, created.address, created.city, created.postalCode).catch(() => {}));
  }

  revalidatePath("/dashboard/clients");
  revalidatePath("/dashboard/carte");

  return { ok: true, client: mapClient(created) };
}

export type ClientWithAnimalsResult =
  | { ok: true; client: Client }
  | { ok: false; error: string; animalErrors?: Record<number, AnimalFieldErrors> };

/**
 * « Nouveau client » avec ses animaux, en une fois (chantier C3).
 *
 * Une seule transaction : tout est validé avant d'écrire — le propriétaire
 * comme chaque animal, avec les mêmes règles que leurs actions séparées —,
 * puis client et animaux sont créés ensemble. Si un animal est refusé, rien
 * n'est créé et l'erreur revient sur sa section : pas de client orphelin à
 * rattraper, ni de doublon si l'on réessaie.
 */
export async function createClientWithAnimalsAction(input: { client: ClientContactInput; animals: UpdateAnimalInput[] }): Promise<ClientWithAnimalsResult> {
  const user = await requireUser();
  const db = await currentDb();

  const firstName = input.client.firstName.trim();
  const lastName = input.client.lastName.trim();
  if (!firstName || !lastName) return { ok: false, error: "Le prénom et le nom sont obligatoires." };
  const email = input.client.email.trim();
  if (email && !emailPattern.test(email)) return { ok: false, error: "Email invalide." };
  if (input.animals.length > 20) return { ok: false, error: "Vingt animaux au plus à la fois." };

  const animals: ValidAnimal[] = [];
  const animalErrors: Record<number, AnimalFieldErrors> = {};
  input.animals.forEach((animal, index) => {
    // Un nouveau client n'a pas encore de lieux d'animaux à citer.
    const validation = validateAnimal({ ...animal, placeId: undefined });
    if (validation.ok) animals.push(validation.data);
    else animalErrors[index] = validation.errors;
  });
  if (Object.keys(animalErrors).length > 0) {
    const first = Number(Object.keys(animalErrors)[0]);
    return { ok: false, error: `Animal ${first + 1} : ${firstAnimalError(animalErrors[first])}`, animalErrors };
  }

  const created = await db.$transaction(async (tx) => {
    const client = await tx.client.create({
      data: {
        firstName,
        lastName,
        phone: input.client.phone.trim(),
        email,
        city: input.client.city.trim(),
        postalCode: input.client.postalCode.trim() || null,
        address: input.client.address.trim(),
      },
    });
    for (const animal of animals) {
      await tx.animal.create({
        data: {
          ...animalData(animal),
          clientId: client.id,
          avatar: avatarForSpecies(animal.species as PublicAnimalType),
          avatarBackground: avatarBackgroundFor(`${client.id}-${animal.name}`),
        },
      });
    }
    return tx.client.findUniqueOrThrow({ where: { id: client.id }, include: clientInclude });
  });

  await logAudit({ userId: user.id, action: "CLIENT_CREATED", entityType: "Client", entityId: created.id });
  for (const animal of created.animals) {
    await logAudit({ userId: user.id, action: "ANIMAL_UPDATED", entityType: "Animal", entityId: animal.id, metadata: { clientId: created.id, created: true } });
  }
  if (created.address && created.city) {
    after(() => geocodeClientInBackground(created.organizationId, created.id, created.address, created.city, created.postalCode).catch(() => {}));
  }

  revalidatePath("/dashboard/clients");
  revalidatePath("/dashboard/carte");
  return { ok: true, client: mapClient(created) };
}

export async function updateClientAction(clientId: string, input: ClientContactInput): Promise<ClientResult> {
  const user = await requireUser();
  const db = await currentDb();

  const existing = await db.client.findUnique({ where: { id: clientId }, select: { id: true, address: true, city: true } });
  if (!existing) return { ok: false, error: "Client introuvable." };

  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  if (!firstName || !lastName) return { ok: false, error: "Le prénom et le nom sont obligatoires." };
  const email = input.email.trim();
  if (email && !emailPattern.test(email)) return { ok: false, error: "Email invalide." };

  const fullName = `${firstName} ${lastName}`;
  const [updated] = await db.$transaction([
    db.client.update({
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
    db.appointment.updateMany({ where: { clientId }, data: { clientName: fullName } }),
  ]);
  await logAudit({ userId: user.id, action: "CLIENT_UPDATED", entityType: "Client", entityId: clientId });

  // Re-géocode seulement si l'adresse a réellement changé — jamais à
  // chaque modification (téléphone, email…) qui n'a rien à voir avec la
  // position.
  if (updated.address !== existing.address || updated.city !== existing.city) {
    if (updated.address && updated.city) {
      after(() => geocodeClientInBackground(updated.organizationId, clientId, updated.address, updated.city, updated.postalCode).catch(() => {}));
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
  const db = await currentDb();

  const client = await db.client.findUnique({ where: { id: clientId }, select: { id: true, address: true, city: true, postalCode: true } });
  if (!client) return { ok: false, error: "Client introuvable." };

  const geocoded = await geocodeClientAddress(client);
  if (!geocoded) return { ok: false, error: "Adresse introuvable, vérifiez son orthographe." };

  await db.client.update({ where: { id: clientId }, data: positionData(geocoded) });

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
  /** Date de naissance (AAAA-MM-JJ) ; vide ou null = inconnue. Absent = inchangée. */
  birthDate?: string | null;
  /** Année seule connue : l'âge s'affiche alors en estimation. */
  birthDateApproximate?: boolean;
  /**
   * Lieu où vit l'animal (phase 8.9) : un lieu de l'espace, ou null pour
   * « chez son propriétaire ». Absent = inchangé.
   */
  placeId?: string | null;
};

/** Champs écrits en base, depuis une saisie validée : la liste blanche. */
function animalData(data: ValidAnimal) {
  return {
    name: data.name,
    species: data.species,
    breed: data.breed,
    age: data.age,
    weight: data.weight,
    sex: data.sex,
    history: data.history,
    conditions: data.conditions,
    treatments: data.treatments,
    notes: data.notes,
    ...(data.birthDate !== undefined ? { birthDate: data.birthDate ? new Date(`${data.birthDate}T00:00:00.000Z`) : null, birthDateApproximate: data.birthDate ? Boolean(data.birthDateApproximate) : false } : {}),
    ...(data.placeId !== undefined ? { placeId: data.placeId } : {}),
  };
}

const animalInclude = { consultations: { orderBy: { date: "desc" as const } }, documents: { orderBy: { createdAt: "desc" as const } }, place: { select: { id: true, name: true, kind: true, city: true } } };

/** Un lieu cité par le navigateur doit exister dans l'espace courant. */
async function checkedPlaceId(db: Awaited<ReturnType<typeof currentDb>>, placeId: string | null | undefined): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!placeId) return { ok: true };
  const place = await db.animalPlace.findUnique({ where: { id: placeId }, select: { id: true } });
  return place ? { ok: true } : { ok: false, error: "Ce lieu n’existe plus." };
}

export async function updateAnimalAction(animalId: string, input: UpdateAnimalInput): Promise<AnimalResult> {
  const user = await requireUser();
  const db = await currentDb();

  const animal = await db.animal.findUnique({ where: { id: animalId }, select: { id: true, clientId: true, species: true, sex: true } });
  if (!animal) return { ok: false, error: "Animal introuvable." };

  // Une ancienne espèce ou un ancien sexe restent acceptés s'ils ne changent pas.
  const validation = validateAnimal(input, { species: animal.species, sex: animal.sex });
  if (!validation.ok) return { ok: false, error: firstAnimalError(validation.errors) };
  const data = validation.data;
  const placeCheck = await checkedPlaceId(db, data.placeId);
  if (!placeCheck.ok) return placeCheck;

  // Changer d'espèce change le pictogramme (bug #23) ; le fond de couleur et
  // une éventuelle photo, eux, restent.
  const speciesChanged = data.species !== animal.species;
  const [updated] = await db.$transaction([
    db.animal.update({
      where: { id: animalId },
      data: { ...animalData(data), ...(speciesChanged ? { avatar: avatarForSpecies(data.species as PublicAnimalType) } : {}) },
      include: animalInclude,
    }),
    db.appointment.updateMany({ where: { animalId }, data: { animalName: data.name } }),
  ]);
  await logAudit({ userId: user.id, action: "ANIMAL_UPDATED", entityType: "Animal", entityId: animalId, metadata: { clientId: animal.clientId } });

  revalidatePath(`/dashboard/clients/${animal.clientId}`);
  revalidatePath("/dashboard/clients");
  revalidatePath("/dashboard/rappels");
  revalidatePath("/dashboard/agenda");
  revalidatePath("/dashboard/carte");
  revalidatePath("/dashboard");

  // L'animal tel qu'enregistré : le navigateur n'a pas à le reconstituer.
  return { ok: true, animal: mapAnimal(updated) };
}

export type AnimalResult = { ok: true; animal: Animal } | { ok: false; error: string };

export async function createAnimalAction(clientId: string, input: UpdateAnimalInput): Promise<AnimalResult> {
  const user = await requireUser();
  const db = await currentDb();

  const client = await db.client.findUnique({ where: { id: clientId }, select: { id: true } });
  if (!client) return { ok: false, error: "Client introuvable." };

  // Création : nom, espèce de la liste et sexe obligatoires.
  const validation = validateAnimal(input);
  if (!validation.ok) return { ok: false, error: firstAnimalError(validation.errors) };
  const data = validation.data;
  const placeCheck = await checkedPlaceId(db, data.placeId);
  if (!placeCheck.ok) return placeCheck;

  const created = await db.animal.create({
    data: {
      ...animalData(data),
      clientId,
      avatar: avatarForSpecies(data.species as PublicAnimalType),
      avatarBackground: avatarBackgroundFor(`${clientId}-${data.name}`),
    },
    include: animalInclude,
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
  const db = await currentDb();

  const animal = await db.animal.findUnique({ where: { id: animalId }, select: { id: true, clientId: true, name: true } });
  if (!animal) return { ok: false, error: "Animal introuvable." };

  await db.animal.delete({ where: { id: animalId } });
  await logAudit({ userId: user.id, action: "ANIMAL_DELETED", entityType: "Animal", entityId: animalId, metadata: animalDeletedMetadata(animal.clientId) });

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
  // Une recherche sans compte connecté ne renvoie rien, plutôt qu'une
  // erreur : la saisie en cours n'a pas à être bloquante.
  const user = await getCurrentUser();
  if (!user) return { clients: [], animals: [] };
  const db = await currentDb();

  const parsed = clientSearchQuerySchema.safeParse(rawQuery);
  if (!parsed.success) return { clients: [], animals: [] };

  // Toutes les fiches de l'espace, classées comme dans l'en-tête (accents,
  // fautes) : un ILIKE ne sait faire ni l'un ni l'autre, et à l'échelle d'un
  // cabinet les classer ici reste instantané.
  const people = await db.client.findMany({
    where: { archivedAt: null },
    select: { id: true, firstName: true, lastName: true, address: true, city: true, phone: true, animals: { select: { id: true, name: true, species: true } } },
  });
  const ranked = rankClientsAndAnimals(parsed.data, people);

  return {
    clients: ranked.clients.map(({ client }) => ({ id: client.id, firstName: client.firstName, lastName: client.lastName, address: client.address, city: client.city })),
    animals: ranked.animals.map(({ animal, client }): AnimalSearchResult => ({
      id: animal.id,
      name: animal.name,
      species: animal.species as AnimalSpecies,
      clientId: client.id,
      ownerName: `${client.firstName} ${client.lastName}`,
      city: client.city,
    })),
  };
}

const LOCATE_BATCH_SIZE = 5;
const LOCATE_PAUSE_MS = 250;
// Au plus par passage : le service IGN est limité (50 requêtes/s par IP),
// et une page ne doit pas attendre des minutes. Un second passage reprend
// là où le premier s'est arrêté.
const LOCATE_MAX_PER_RUN = 150;

export type LocateClientsResult = { ok: true; located: number; notFound: number; remaining: number } | { ok: false; error: string };

/**
 * « Localiser les clients sans position » : géocode par lots les fiches qui
 * ont une adresse mais aucune position, dans l'espace du compte connecté
 * seulement. Chaque échec est isolé (Promise.allSettled) — une adresse
 * introuvable n'arrête pas les autres —, une courte pause sépare les lots,
 * et le passage est tracé dans le journal d'audit.
 */
export async function locateUnlocatedClientsAction(): Promise<LocateClientsResult> {
  const user = await requireUser();
  const db = await currentDb();

  const pending = await db.client.findMany({
    where: { latitude: null, address: { not: "" } },
    select: { id: true, address: true, city: true, postalCode: true },
    orderBy: { lastName: "asc" },
  });
  const batch = pending.slice(0, LOCATE_MAX_PER_RUN);

  let located = 0;
  let notFound = 0;
  for (let start = 0; start < batch.length; start += LOCATE_BATCH_SIZE) {
    const slice = batch.slice(start, start + LOCATE_BATCH_SIZE);
    const results = await Promise.allSettled(slice.map(async (client) => {
      const geocoded = await geocodeClientAddress(client);
      await db.client.update({ where: { id: client.id }, data: positionData(geocoded) });
      return geocoded !== null;
    }));
    for (const result of results) {
      if (result.status === "fulfilled" && result.value) located += 1;
      else notFound += 1;
    }
    if (start + LOCATE_BATCH_SIZE < batch.length) await new Promise((resolve) => setTimeout(resolve, LOCATE_PAUSE_MS));
  }

  await logAudit({ userId: user.id, action: "CLIENTS_GEOCODED", entityType: "Client", metadata: { located, notFound, attempted: batch.length } });
  revalidatePath("/dashboard/carte");
  revalidatePath("/dashboard/tournees");
  return { ok: true, located, notFound, remaining: pending.length - batch.length };
}
