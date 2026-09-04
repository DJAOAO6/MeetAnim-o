"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { hasPermission } from "@/lib/auth/permissions";
import { isRateLimited, recordAttempt } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit";
import { computeAgeLabel } from "@/lib/animal-age";
import { avatarBackgroundFor, avatarForSpecies } from "@/data/animal-visuals";
import { animalSpeciesList } from "@/data/species";
import type { PublicAnimalType } from "@/data/public-booking";
import type { Client as DbClient } from "@/generated/prisma/client";

// Chantier d'import de fichiers clients (CSV/Excel), phase 2 : schéma, actions
// serveur par lots, et annulation. Voir PROMPT-IMPORT-CLIENTS.md — décisions
// D4 à D10.

const MAX_TOTAL_ROWS = 2000;
const MAX_CHUNK_ROWS = 200;
const START_RATE_LIMIT_MAX_ATTEMPTS = 5;
const START_RATE_LIMIT_WINDOW_MS = 3_600_000;
const UNDO_WINDOW_MS = 24 * 60 * 60 * 1000;

export type ConflictPolicy = "COMPLETE" | "IGNORE" | "CREER";

const conflictPolicySchema = z.enum(["COMPLETE", "IGNORE", "CREER"]);

// --- startClientImportAction ------------------------------------------

const startImportSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  totalRows: z.number().int().min(1).max(MAX_TOTAL_ROWS),
  conflictPolicy: conflictPolicySchema,
});

export type StartClientImportResult = { ok: true; importId: string } | { ok: false; error: string };

export async function startClientImportAction(input: {
  fileName: string;
  totalRows: number;
  conflictPolicy: ConflictPolicy;
}): Promise<StartClientImportResult> {
  const user = await requireUser();

  const parsed = startImportSchema.safeParse(input);
  if (!parsed.success) {
    if (input.totalRows > MAX_TOTAL_ROWS) {
      return { ok: false, error: `Ce fichier contient ${input.totalRows} lignes, ce qui dépasse la limite de ${MAX_TOTAL_ROWS}.` };
    }
    return { ok: false, error: "Fichier invalide." };
  }

  if (await isRateLimited(`client-import:${user.id}`, START_RATE_LIMIT_MAX_ATTEMPTS, START_RATE_LIMIT_WINDOW_MS)) {
    return { ok: false, error: "Trop d'imports lancés récemment, réessayez dans une heure." };
  }
  await recordAttempt(`client-import:${user.id}`);

  const created = await prisma.clientImport.create({
    data: {
      userId: user.id,
      fileName: parsed.data.fileName,
      totalRows: parsed.data.totalRows,
      conflictPolicy: parsed.data.conflictPolicy,
    },
  });

  return { ok: true, importId: created.id };
}

// --- importClientsChunkAction -------------------------------------------

const animalPayloadSchema = z.object({
  name: z.string().trim().min(1).max(200),
  species: z.enum(animalSpeciesList as [string, ...string[]]),
  breed: z.string().trim().max(200),
  sex: z.string().trim().max(50),
  weight: z.string().trim().max(50),
  birthDateIso: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal("")]),
  birthDateApproximate: z.boolean(),
  conditions: z.string().trim().max(5000),
  treatments: z.string().trim().max(5000),
  history: z.string().trim().max(5000),
  notes: z.string().trim().max(5000),
});

const rowPayloadSchema = z.object({
  lineNumber: z.number().int().min(2),
  firstName: z.string().trim().max(200),
  lastName: z.string().trim().max(200),
  phone: z.string().trim().max(50),
  email: z.string().trim().max(320),
  address: z.string().trim().max(500),
  postalCode: z.string().trim().max(20),
  city: z.string().trim().max(200),
  status: z.enum(["ACTIF", "INACTIF"]),
  animal: animalPayloadSchema.nullable(),
});

export type ImportRowPayload = z.infer<typeof rowPayloadSchema>;

const importChunkSchema = z.object({
  importId: z.string().min(1),
  rows: z.array(rowPayloadSchema).min(1).max(MAX_CHUNK_ROWS),
});

export type RowResultStatus = "client_created" | "client_merged" | "duplicate_ignored" | "error";
export type RowResult = { lineNumber: number; status: RowResultStatus; message?: string };

type ClientCandidate = Pick<DbClient, "id" | "firstName" | "lastName" | "phone" | "email" | "address" | "city" | "postalCode">;

function phoneKey(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("33") && digits.length === 11) return `0${digits.slice(2)}`;
  return digits;
}

function nameCityKey(lastName: string, firstName: string, city: string): string {
  const normalize = (value: string) => value.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  return `${normalize(lastName)}|${normalize(firstName)}|${normalize(city)}`;
}

type ClientIndex = {
  byEmail: Map<string, ClientCandidate>;
  byPhone: Map<string, ClientCandidate>;
  byNameCity: Map<string, ClientCandidate>;
};

// Rapprochement (D6) contre la base : chargé une seule fois par lot plutôt
// qu'une requête par ligne. À l'échelle d'une base clients d'un praticien
// (quelques centaines à quelques milliers de fiches), charger l'ensemble de
// la base pour construire un index en mémoire reste largement raisonnable —
// il n'existe pas de colonne de téléphone normalisée en base pour filtrer
// autrement côté SQL.
async function loadClientIndex(): Promise<ClientIndex> {
  const clients = await prisma.client.findMany({
    select: { id: true, firstName: true, lastName: true, phone: true, email: true, address: true, city: true, postalCode: true },
  });

  const index: ClientIndex = { byEmail: new Map(), byPhone: new Map(), byNameCity: new Map() };
  for (const client of clients) {
    if (client.email) index.byEmail.set(client.email.toLowerCase(), client);
    const key = phoneKey(client.phone);
    if (key) index.byPhone.set(key, client);
    index.byNameCity.set(nameCityKey(client.lastName, client.firstName, client.city), client);
  }
  return index;
}

function indexClient(index: ClientIndex, client: ClientCandidate): void {
  if (client.email) index.byEmail.set(client.email.toLowerCase(), client);
  const key = phoneKey(client.phone);
  if (key) index.byPhone.set(key, client);
  index.byNameCity.set(nameCityKey(client.lastName, client.firstName, client.city), client);
}

type IdentityFields = { email: string; phone: string; lastName: string; firstName: string; city: string };

function findExistingClient(index: ClientIndex, row: IdentityFields): ClientCandidate | null {
  if (row.email) {
    const match = index.byEmail.get(row.email.toLowerCase());
    if (match) return match;
  }
  const key = phoneKey(row.phone);
  if (key) {
    const match = index.byPhone.get(key);
    if (match) return match;
  }
  return index.byNameCity.get(nameCityKey(row.lastName, row.firstName, row.city)) ?? null;
}

// --- checkClientMatchesAction ---------------------------------------------
// Lecture seule : permet à l'assistant d'import (phase 3) d'annoncer, avant
// de rien écrire, quelles lignes du fichier correspondent déjà à une fiche
// en base (mêmes compteurs "nouveaux clients"/"fiches existantes complétées"
// que l'étape de vérification). Un seul aller-retour par ouverture de
// l'étape, pas de plafond de lot — lecture seule et bon marché.

const matchCandidateSchema = z.object({
  lineNumber: z.number().int().min(2),
  firstName: z.string().trim().max(200),
  lastName: z.string().trim().max(200),
  phone: z.string().trim().max(50),
  email: z.string().trim().max(320),
  city: z.string().trim().max(200),
});

const checkMatchesSchema = z.object({
  candidates: z.array(matchCandidateSchema).min(1).max(MAX_TOTAL_ROWS),
});

export type MatchCandidate = z.infer<typeof matchCandidateSchema>;
export type ClientMatch = { lineNumber: number; existing: boolean };
export type CheckClientMatchesResult = { ok: true; matches: ClientMatch[] } | { ok: false; error: string };

export async function checkClientMatchesAction(candidates: MatchCandidate[]): Promise<CheckClientMatchesResult> {
  await requireUser();

  const parsed = checkMatchesSchema.safeParse({ candidates });
  if (!parsed.success) return { ok: false, error: "Données invalides." };

  const index = await loadClientIndex();
  const matches = parsed.data.candidates.map((candidate) => ({
    lineNumber: candidate.lineNumber,
    existing: findExistingClient(index, candidate) !== null,
  }));

  return { ok: true, matches };
}

export type ImportClientsChunkResult = { ok: true; results: RowResult[] } | { ok: false; error: string };

export async function importClientsChunkAction(importId: string, rows: ImportRowPayload[]): Promise<ImportClientsChunkResult> {
  const user = await requireUser();

  const parsed = importChunkSchema.safeParse({ importId, rows });
  if (!parsed.success) return { ok: false, error: "Lot de lignes invalide." };

  const clientImport = await prisma.clientImport.findUnique({ where: { id: parsed.data.importId } });
  if (!clientImport || clientImport.userId !== user.id) return { ok: false, error: "Import introuvable." };
  if (clientImport.status !== "RUNNING") return { ok: false, error: "Cet import n'est plus en cours." };

  const index = await loadClientIndex();
  const results: RowResult[] = [];
  const touchedClients = new Set<string>();
  let createdClients = 0;
  let createdAnimals = 0;
  let mergedClients = 0;
  let skippedRows = 0;
  let errorRows = 0;

  // Boucle séquentielle et non `Promise.all` : le pool de connexions Neon
  // serverless est limité, des dizaines de transactions concurrentes le
  // saturent (D4).
  for (const row of parsed.data.rows) {
    try {
      if (!row.firstName && !row.lastName) {
        errorRows += 1;
        results.push({ lineNumber: row.lineNumber, status: "error", message: "Aucun nom ni prénom renseigné." });
        continue;
      }

      const existing = findExistingClient(index, row);

      if (existing && clientImport.conflictPolicy === "IGNORE") {
        skippedRows += 1;
        results.push({ lineNumber: row.lineNumber, status: "duplicate_ignored" });
        continue;
      }

      let clientRecord: ClientCandidate;
      let isNewClient = false;

      if (existing && clientImport.conflictPolicy === "COMPLETE") {
        // On ne remplit que les champs vides de la fiche existante — jamais
        // une valeur déjà saisie n'est écrasée (D7).
        const patch: Partial<Pick<DbClient, "phone" | "email" | "address" | "postalCode" | "city">> = {};
        if (!existing.phone && row.phone) patch.phone = row.phone;
        if (!existing.email && row.email) patch.email = row.email;
        if (!existing.address && row.address) patch.address = row.address;
        if (!existing.postalCode && row.postalCode) patch.postalCode = row.postalCode;
        if (!existing.city && row.city) patch.city = row.city;

        clientRecord = Object.keys(patch).length > 0 ? await prisma.client.update({ where: { id: existing.id }, data: patch }) : existing;

        if (!touchedClients.has(existing.id)) {
          touchedClients.add(existing.id);
          mergedClients += 1;
        }
      } else {
        clientRecord = await prisma.client.create({
          data: {
            firstName: row.firstName,
            lastName: row.lastName,
            phone: row.phone,
            email: row.email,
            city: row.city,
            postalCode: row.postalCode || null,
            address: row.address,
            status: row.status,
            importId: clientImport.id,
          },
        });
        isNewClient = true;
        touchedClients.add(clientRecord.id);
        createdClients += 1;
        indexClient(index, clientRecord);
      }

      if (row.animal) {
        const existingAnimal = await prisma.animal.findFirst({
          where: { clientId: clientRecord.id, name: { equals: row.animal.name, mode: "insensitive" } },
          select: { id: true },
        });

        if (!existingAnimal) {
          const species = row.animal.species;
          await prisma.animal.create({
            data: {
              clientId: clientRecord.id,
              name: row.animal.name,
              species,
              breed: row.animal.breed,
              age: computeAgeLabel({ date: row.animal.birthDateIso, approximate: row.animal.birthDateApproximate }) ?? "",
              birthDate: row.animal.birthDateIso ? new Date(`${row.animal.birthDateIso}T00:00:00.000Z`) : null,
              birthDateApproximate: row.animal.birthDateApproximate,
              weight: row.animal.weight,
              sex: row.animal.sex,
              avatar: avatarForSpecies(species as PublicAnimalType),
              avatarBackground: avatarBackgroundFor(`${clientRecord.id}-${row.animal.name}`),
              history: row.animal.history,
              conditions: row.animal.conditions,
              treatments: row.animal.treatments,
              notes: row.animal.notes,
              importId: clientImport.id,
            },
          });
          createdAnimals += 1;
        }
      }

      results.push({ lineNumber: row.lineNumber, status: isNewClient ? "client_created" : "client_merged" });
    } catch {
      errorRows += 1;
      results.push({ lineNumber: row.lineNumber, status: "error", message: "Erreur inattendue lors de l'import de cette ligne." });
    }
  }

  await prisma.clientImport.update({
    where: { id: clientImport.id },
    data: {
      createdClients: { increment: createdClients },
      createdAnimals: { increment: createdAnimals },
      mergedClients: { increment: mergedClients },
      skippedRows: { increment: skippedRows },
      errorRows: { increment: errorRows },
    },
  });

  return { ok: true, results };
}

// --- finishClientImportAction --------------------------------------------

export type ImportSummary = {
  importId: string;
  createdClients: number;
  createdAnimals: number;
  mergedClients: number;
  skippedRows: number;
  errorRows: number;
};

export type FinishClientImportResult = { ok: true; summary: ImportSummary } | { ok: false; error: string };

export async function finishClientImportAction(importId: string): Promise<FinishClientImportResult> {
  const user = await requireUser();

  const existing = await prisma.clientImport.findUnique({ where: { id: importId } });
  if (!existing || existing.userId !== user.id) return { ok: false, error: "Import introuvable." };

  const updated = await prisma.clientImport.update({ where: { id: importId }, data: { status: "COMPLETED" } });

  await logAudit({
    userId: user.id,
    action: "CLIENTS_IMPORTED",
    entityType: "ClientImport",
    entityId: importId,
    metadata: {
      fileName: updated.fileName,
      createdClients: updated.createdClients,
      createdAnimals: updated.createdAnimals,
      mergedClients: updated.mergedClients,
      skippedRows: updated.skippedRows,
      errorRows: updated.errorRows,
    },
  });

  revalidatePath("/dashboard/clients");
  revalidatePath("/dashboard/carte");

  return {
    ok: true,
    summary: {
      importId: updated.id,
      createdClients: updated.createdClients,
      createdAnimals: updated.createdAnimals,
      mergedClients: updated.mergedClients,
      skippedRows: updated.skippedRows,
      errorRows: updated.errorRows,
    },
  };
}

// --- undoClientImportAction -----------------------------------------------

export type UndoClientImportResult =
  | { ok: true; deleted: { clients: number; animals: number }; preserved: { clients: number; animals: number } }
  | { ok: false; error: string };

export async function undoClientImportAction(importId: string): Promise<UndoClientImportResult> {
  const user = await requireUser();

  const clientImport = await prisma.clientImport.findUnique({ where: { id: importId } });
  if (!clientImport) return { ok: false, error: "Import introuvable." };

  const isOwner = clientImport.userId === user.id;
  const withinWindow = Date.now() - clientImport.createdAt.getTime() < UNDO_WINDOW_MS;
  const canForce = hasPermission(user, "DELETE_CLIENTS");

  if (!((isOwner && withinWindow) || canForce)) {
    return { ok: false, error: "Cet import ne peut plus être annulé (délai de 24h dépassé et permission de suppression manquante)." };
  }

  const importedClients = await prisma.client.findMany({
    where: { importId },
    select: {
      id: true,
      appointments: { select: { id: true }, take: 1 },
      reminders: { select: { id: true }, take: 1 },
      animals: {
        select: {
          id: true,
          consultations: { select: { id: true }, take: 1 },
          reminders: { select: { id: true }, take: 1 },
          appointments: { select: { id: true }, take: 1 },
        },
      },
    },
  });

  function clientHasHistory(client: (typeof importedClients)[number]): boolean {
    if (client.appointments.length > 0 || client.reminders.length > 0) return true;
    return client.animals.some((animal) => animal.consultations.length > 0 || animal.reminders.length > 0 || animal.appointments.length > 0);
  }

  const clientsToDelete = importedClients.filter((client) => !clientHasHistory(client));
  const clientsPreservedCount = importedClients.length - clientsToDelete.length;
  const cascadedAnimalsCount = clientsToDelete.reduce((sum, client) => sum + client.animals.length, 0);

  // Animaux créés par l'import mais rattachés à un client préexistant
  // (fiche seulement complétée, jamais rattachée à l'import — D9) : à
  // supprimer individuellement, avec le même garde-fou.
  const importedClientIds = importedClients.map((client) => client.id);
  const standaloneAnimals = await prisma.animal.findMany({
    where: { importId, clientId: { notIn: importedClientIds } },
    select: {
      id: true,
      consultations: { select: { id: true }, take: 1 },
      reminders: { select: { id: true }, take: 1 },
      appointments: { select: { id: true }, take: 1 },
    },
  });
  const standaloneAnimalsToDelete = standaloneAnimals.filter(
    (animal) => animal.consultations.length === 0 && animal.reminders.length === 0 && animal.appointments.length === 0,
  );
  const standaloneAnimalsPreservedCount = standaloneAnimals.length - standaloneAnimalsToDelete.length;

  await prisma.$transaction([
    prisma.animal.deleteMany({ where: { id: { in: standaloneAnimalsToDelete.map((animal) => animal.id) } } }),
    prisma.client.deleteMany({ where: { id: { in: clientsToDelete.map((client) => client.id) } } }),
  ]);

  await prisma.clientImport.update({ where: { id: importId }, data: { status: "UNDONE" } });

  const deletedClientsCount = clientsToDelete.length;
  const deletedAnimalsCount = cascadedAnimalsCount + standaloneAnimalsToDelete.length;
  const preservedClientsCount = clientsPreservedCount;
  const preservedAnimalsCount = standaloneAnimalsPreservedCount;

  await logAudit({
    userId: user.id,
    action: "CLIENT_IMPORT_UNDONE",
    entityType: "ClientImport",
    entityId: importId,
    metadata: {
      deletedClients: deletedClientsCount,
      deletedAnimals: deletedAnimalsCount,
      preservedClients: preservedClientsCount,
      preservedAnimals: preservedAnimalsCount,
    },
  });

  revalidatePath("/dashboard/clients");
  revalidatePath("/dashboard/carte");
  revalidatePath("/dashboard/rappels");

  return {
    ok: true,
    deleted: { clients: deletedClientsCount, animals: deletedAnimalsCount },
    preserved: { clients: preservedClientsCount, animals: preservedAnimalsCount },
  };
}
