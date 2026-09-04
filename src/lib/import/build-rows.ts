import type { AnimalSpecies } from "@/data/species";
import type { ClientStatus } from "@/generated/prisma/client";
import type { ImportField } from "./fields";
import { normalizeEmail, normalizePhone, normalizeSpecies, normalizeStatus, parseFrenchDate, phoneKey } from "./normalize";

export type ImportIssue = { level: "error" | "warning"; message: string };

export type ParsedAnimal = {
  name: string;
  species: AnimalSpecies;
  speciesRecognized: boolean;
  breed: string;
  sex: string;
  weight: string;
  birthDateIso: string;
  birthDateApproximate: boolean;
  conditions: string;
  treatments: string;
  history: string;
  notes: string;
};

export type ParsedClientRow = {
  firstName: string;
  lastName: string;
  phone: string;
  phoneKey: string;
  email: string;
  address: string;
  postalCode: string;
  city: string;
  status: ClientStatus;
  animal: ParsedAnimal | null;
};

export type PreparedRow = {
  lineNumber: number;
  value: ParsedClientRow;
  issues: ImportIssue[];
  identityKey: string;
  groupIndex: number;
};

export type PreparedGroupClient = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  address: string;
  postalCode: string;
  city: string;
  status: ClientStatus;
};

export type PreparedGroup = {
  identityKey: string;
  client: PreparedGroupClient;
  animals: ParsedAnimal[];
  lineNumbers: number[];
};

const FRENCH_NATIONAL_PHONE = /^0[1-9]\d{8}$/;

function cell(row: string[], mapping: Partial<Record<ImportField, number>>, field: ImportField): string {
  const index = mapping[field];
  if (index === undefined) return "";
  return (row[index] ?? "").trim();
}

function normalizeForKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function buildIdentityKey(client: PreparedGroupClient): string {
  if (client.email) return `email:${client.email}`;
  const key = phoneKey(client.phone);
  if (key) return `phone:${key}`;
  return `name:${normalizeForKey(client.lastName)}|${normalizeForKey(client.firstName)}|${normalizeForKey(client.city)}`;
}

function buildAnimal(row: string[], mapping: Partial<Record<ImportField, number>>, options: { defaultSpecies: AnimalSpecies }, issues: ImportIssue[]): ParsedAnimal | null {
  const name = cell(row, mapping, "animalName");
  if (!name) {
    issues.push({ level: "warning", message: "Ligne sans animal." });
    return null;
  }

  const rawSpecies = cell(row, mapping, "species");
  const normalizedSpecies = rawSpecies ? normalizeSpecies(rawSpecies) : null;
  if (rawSpecies && !normalizedSpecies) {
    issues.push({ level: "warning", message: `Espèce « ${rawSpecies} » non reconnue — espèce par défaut appliquée.` });
  }
  const species = normalizedSpecies ?? options.defaultSpecies;

  const rawBirthDate = cell(row, mapping, "birthDate");
  const parsedBirthDate = rawBirthDate ? parseFrenchDate(rawBirthDate) : null;
  if (rawBirthDate && !parsedBirthDate) {
    issues.push({ level: "warning", message: `Date de naissance « ${rawBirthDate} » illisible — ignorée.` });
  }

  return {
    name,
    species,
    speciesRecognized: normalizedSpecies !== null,
    breed: cell(row, mapping, "breed"),
    sex: cell(row, mapping, "sex"),
    weight: cell(row, mapping, "weight"),
    birthDateIso: parsedBirthDate?.iso ?? "",
    birthDateApproximate: parsedBirthDate?.approximate ?? false,
    conditions: cell(row, mapping, "conditions"),
    treatments: cell(row, mapping, "treatments"),
    history: cell(row, mapping, "history"),
    notes: cell(row, mapping, "animalNotes"),
  };
}

/**
 * Transforme les lignes brutes du fichier en lignes normalisées, regroupées
 * par client (D5/D6) : le premier client rencontré pour une `identityKey`
 * donnée porte les champs de contact, les lignes suivantes n'apportent que
 * leur animal.
 */
export function prepareRows(
  rows: string[][],
  mapping: Partial<Record<ImportField, number>>,
  options: { defaultSpecies: AnimalSpecies },
): { prepared: PreparedRow[]; groups: PreparedGroup[] } {
  const prepared: PreparedRow[] = [];
  const groups: PreparedGroup[] = [];
  const groupIndexByKey = new Map<string, number>();

  rows.forEach((row, rowIndex) => {
    const issues: ImportIssue[] = [];
    const rawEmail = cell(row, mapping, "email");
    const email = rawEmail ? normalizeEmail(rawEmail) : "";
    if (rawEmail && !email) {
      issues.push({ level: "warning", message: `Email « ${rawEmail} » invalide — ignoré.` });
    }

    const rawPhone = cell(row, mapping, "phone");
    if (rawPhone && !FRENCH_NATIONAL_PHONE.test(phoneKey(rawPhone))) {
      issues.push({ level: "warning", message: `Téléphone « ${rawPhone} » non reconnu — valeur conservée telle quelle.` });
    }

    const firstName = cell(row, mapping, "firstName");
    const lastName = cell(row, mapping, "lastName");
    if (!firstName && !lastName) {
      issues.push({ level: "error", message: "Aucun nom ni prénom renseigné — ligne non importable." });
    }

    const clientFields: PreparedGroupClient = {
      firstName,
      lastName,
      phone: normalizePhone(rawPhone),
      email,
      address: cell(row, mapping, "address"),
      postalCode: cell(row, mapping, "postalCode"),
      city: cell(row, mapping, "city"),
      status: normalizeStatus(cell(row, mapping, "status")),
    };

    const animal = buildAnimal(row, mapping, options, issues);

    const identityKey = buildIdentityKey(clientFields);
    const lineNumber = rowIndex + 2;

    let groupIndex = groupIndexByKey.get(identityKey);
    if (groupIndex === undefined) {
      groupIndex = groups.length;
      groupIndexByKey.set(identityKey, groupIndex);
      groups.push({ identityKey, client: clientFields, animals: [], lineNumbers: [] });
    }

    const group = groups[groupIndex];
    group.lineNumbers.push(lineNumber);
    if (animal) group.animals.push(animal);

    prepared.push({
      lineNumber,
      value: { ...clientFields, phoneKey: phoneKey(clientFields.phone), animal },
      issues,
      identityKey,
      groupIndex,
    });
  });

  return { prepared, groups };
}
