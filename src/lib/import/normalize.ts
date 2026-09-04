import type { AnimalSpecies } from "@/data/species";
import type { ClientStatus } from "@/generated/prisma/client";

function stripDiacritics(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

const SPECIES_SYNONYMS: Array<{ species: AnimalSpecies; matches: string[] }> = [
  { species: "Chien", matches: ["chien", "chienne"] },
  { species: "Chat", matches: ["chat", "chatte"] },
  { species: "Cheval", matches: ["cheval", "jument", "poney", "equide", "etalon"] },
  {
    species: "NAC",
    matches: ["lapin", "furet", "rongeur", "cochon d'inde", "cochon dinde", "hamster", "oiseau", "perroquet", "reptile", "nac"],
  },
  { species: "Petit ruminant", matches: ["chevre", "bouc", "mouton", "brebis", "agneau", "caprin", "ovin"] },
];

export function normalizeSpecies(raw: string): AnimalSpecies | null {
  const normalized = stripDiacritics(raw.trim().toLowerCase());
  if (!normalized) return null;

  for (const entry of SPECIES_SYNONYMS) {
    if (entry.matches.includes(normalized)) return entry.species;
  }
  return null;
}

const MIN_BIRTH_YEAR = 1980;

function isValidCalendarDate(year: number, month: number, day: number): boolean {
  const date = new Date(year, month - 1, day, 12);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function toIsoIfValid(year: number, month: number, day: number): string | null {
  if (!isValidCalendarDate(year, month, day)) return null;
  const now = new Date();
  const candidate = new Date(year, month - 1, day, 12);
  if (candidate.getTime() > now.getTime()) return null;
  if (year < MIN_BIRTH_YEAR) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Formats acceptés : JJ/MM/AAAA, JJ-MM-AAAA, AAAA-MM-JJ, JJ.MM.AAAA, et une
 * année seule (ex. "2019") — traitée comme une date approximative au 1er
 * janvier de cette année (`birthDateApproximate`). Date future ou antérieure
 * à 1980 : rejetée (null).
 */
export function parseFrenchDate(raw: string): { iso: string; approximate: boolean } | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const yearOnly = /^(\d{4})$/.exec(trimmed);
  if (yearOnly) {
    const year = Number(yearOnly[1]);
    if (year < MIN_BIRTH_YEAR || year > new Date().getFullYear()) return null;
    const iso = toIsoIfValid(year, 1, 1);
    return iso ? { iso, approximate: true } : null;
  }

  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (isoMatch) {
    const iso = toIsoIfValid(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));
    return iso ? { iso, approximate: false } : null;
  }

  const dmyMatch = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(trimmed);
  if (dmyMatch) {
    const iso = toIsoIfValid(Number(dmyMatch[3]), Number(dmyMatch[2]), Number(dmyMatch[1]));
    return iso ? { iso, approximate: false } : null;
  }

  return null;
}

const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  return EMAIL_FORMAT.test(trimmed) ? trimmed : "";
}

/**
 * Conserve l'affichage saisi (l'appelant décide s'il déclenche un
 * avertissement lorsque le format n'est pas reconnu) — seule `phoneKey` sert
 * à la comparaison de rapprochement (D6).
 */
export function normalizePhone(raw: string): string {
  return raw.trim();
}

/**
 * Chiffres seuls, indicatif international +33 ramené à un 0 initial — pour
 * comparer deux numéros écrits différemment ("+33 6 12 34 56 78" vs
 * "06.12.34.56.78") lors du rapprochement (D6).
 */
export function phoneKey(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("33") && digits.length === 11) return `0${digits.slice(2)}`;
  return digits;
}

export function normalizeStatus(raw: string): ClientStatus {
  const normalized = stripDiacritics(raw.trim().toLowerCase());
  if (["inactif", "inactive", "ancien", "ancienne"].includes(normalized)) return "INACTIF";
  return "ACTIF";
}
