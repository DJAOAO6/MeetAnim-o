import { z } from "zod";
import { animalSpeciesList } from "@/data/species";

/**
 * Fiche animal (chantier C3) : ce que le serveur exige, et ce que le
 * formulaire affiche — une seule source, pour que l'obligation existe
 * vraiment. Obligatoires : nom, espèce, sexe.
 *
 * Le sexe porte aussi la stérilisation, qui compte en clinique : quatre
 * valeurs, rangées dans la colonne texte existante. Pour un cheval, elles se
 * lisent Étalon, Hongre, Jument (sexLabel).
 */

export const SEX_VALUES = ["Mâle", "Mâle castré", "Femelle", "Femelle stérilisée"] as const;
export type AnimalSex = (typeof SEX_VALUES)[number];
export type SexBase = "Mâle" | "Femelle";

export function sexOf(base: SexBase, neutered: boolean): AnimalSex {
  if (base === "Mâle") return neutered ? "Mâle castré" : "Mâle";
  return neutered ? "Femelle stérilisée" : "Femelle";
}

/** Le sexe de base et la stérilisation d'une valeur reconnue, sinon null. */
export function splitSex(value: string): { base: SexBase; neutered: boolean } | null {
  const sex = normalizeSex(value);
  if (!sex) return null;
  return { base: sex.startsWith("Mâle") ? "Mâle" : "Femelle", neutered: sex !== "Mâle" && sex !== "Femelle" };
}

function simplify(value: string): string {
  return value.trim().toLocaleLowerCase("fr-FR").normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/\s+/g, " ");
}

/**
 * Une saisie libre (import, anciennes fiches) ramenée à l'une des quatre
 * valeurs, ou null si elle n'est pas reconnue — elle reste alors telle quelle
 * dans la fiche, jusqu'à ce qu'on la corrige.
 */
export function normalizeSex(value: string): AnimalSex | null {
  const text = simplify(value);
  if (!text) return null;
  const neutered = /castre|sterilise|hongre|neutre/.test(text) && !/non (castre|sterilise)|entier/.test(text);
  if (/^(m|male|masculin|etalon|hongre)\b/.test(text)) return neutered ? "Mâle castré" : "Mâle";
  if (/^(f|femelle|feminin|jument)\b/.test(text)) return neutered ? "Femelle stérilisée" : "Femelle";
  return null;
}

/** Ce qu'on lit sur la fiche : le vocabulaire équin pour un cheval. */
export function sexLabel(species: string, sex: string): string {
  if (species !== "Cheval") return sex;
  switch (normalizeSex(sex)) {
    case "Mâle": return "Étalon";
    case "Mâle castré": return "Hongre";
    case "Femelle": return "Jument";
    case "Femelle stérilisée": return "Jument stérilisée";
    default: return sex;
  }
}

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

function validBirthDate(value: string): boolean {
  if (!isoDate.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return false;
  return value <= new Date().toISOString().slice(0, 10) && year >= 1950;
}

const text = (max: number) => z.string().trim().max(max, "Texte trop long.");

/** Les champs acceptés, et eux seuls : rien d'autre n'atteint la base. */
const baseSchema = z.object({
  name: z.string().trim().min(1, "Indiquez le nom de l’animal.").max(100, "Nom trop long."),
  species: z.string().trim().min(1, "Choisissez l’espèce."),
  breed: text(120).default(""),
  age: text(60).default(""),
  weight: text(30).default(""),
  sex: z.string().trim(),
  history: text(5000).default(""),
  conditions: text(5000).default(""),
  treatments: text(5000).default(""),
  notes: text(5000).default(""),
  birthDate: z.union([z.literal(""), z.string().refine(validBirthDate, "Date de naissance invalide ou dans le futur.")]).nullish(),
  birthDateApproximate: z.boolean().optional(),
  placeId: z.string().min(1).nullish(),
});

export type AnimalInput = z.input<typeof baseSchema>;
export type ValidAnimal = Omit<z.output<typeof baseSchema>, "birthDate"> & { birthDate: string | null | undefined };
export type AnimalFieldErrors = Partial<Record<"name" | "species" | "sex" | "birthDate" | "form", string>>;
export type AnimalValidation = { ok: true; data: ValidAnimal } | { ok: false; errors: AnimalFieldErrors };

/**
 * Création : espèce de la liste, sexe parmi les quatre valeurs.
 * Modification : une ancienne espèce hors liste, ou un ancien sexe (« M »,
 * vide…), restent acceptés tant qu'ils ne changent pas — sinon une fiche
 * importée ne pourrait plus être enregistrée.
 */
export function validateAnimal(input: unknown, previous?: { species: string; sex: string }): AnimalValidation {
  const parsed = baseSchema.safeParse(input);
  const errors: AnimalFieldErrors = {};
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      const key = field === "name" || field === "species" || field === "sex" || field === "birthDate" ? field : "form";
      errors[key] ??= key === "form" ? "Fiche animal invalide." : issue.message;
    }
    return { ok: false, errors };
  }
  const data = parsed.data;
  const knownSpecies = (animalSpeciesList as readonly string[]).includes(data.species);
  if (!knownSpecies && data.species !== previous?.species) errors.species = "Choisissez l’espèce dans la liste.";
  const knownSex = (SEX_VALUES as readonly string[]).includes(data.sex);
  if (!knownSex && data.sex !== previous?.sex) errors.sex = data.sex ? "Choisissez Mâle ou Femelle." : "Indiquez le sexe de l’animal.";
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, data: { ...data, birthDate: data.birthDate === "" ? null : data.birthDate } };
}

/** Le premier message d'erreur, pour un retour d'action en une phrase. */
export function firstAnimalError(errors: AnimalFieldErrors): string {
  return errors.name ?? errors.species ?? errors.sex ?? errors.birthDate ?? errors.form ?? "Fiche animal invalide.";
}
