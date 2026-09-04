export type ImportField =
  | "firstName"
  | "lastName"
  | "phone"
  | "email"
  | "address"
  | "postalCode"
  | "city"
  | "status"
  | "animalName"
  | "species"
  | "breed"
  | "sex"
  | "weight"
  | "birthDate"
  | "conditions"
  | "treatments"
  | "history"
  | "animalNotes";

export const IMPORT_FIELD_LABELS: Record<ImportField, string> = {
  firstName: "Prénom",
  lastName: "Nom",
  phone: "Téléphone",
  email: "Email",
  address: "Adresse",
  postalCode: "Code postal",
  city: "Ville",
  status: "Statut",
  animalName: "Nom de l'animal",
  species: "Espèce",
  breed: "Race",
  sex: "Sexe",
  weight: "Poids",
  birthDate: "Date de naissance",
  conditions: "Antécédents / pathologies",
  treatments: "Traitements",
  history: "Historique",
  animalNotes: "Notes sur l'animal",
};

export const HEADER_SYNONYMS: Record<ImportField, string[]> = {
  firstName: ["prenom", "prénom", "firstname"],
  lastName: ["nom", "nom de famille", "lastname"],
  phone: ["telephone", "téléphone", "tel", "portable", "mobile", "gsm"],
  email: ["email", "mail", "courriel", "e-mail"],
  address: ["adresse", "rue", "adresse postale"],
  postalCode: ["cp", "code postal", "codepostal", "zip"],
  city: ["ville", "commune"],
  status: ["statut", "état", "etat", "actif"],
  animalName: ["animal", "nom animal", "nom de l'animal", "patient"],
  species: ["espece", "espèce", "type"],
  breed: ["race", "breed"],
  sex: ["sexe", "sex"],
  weight: ["poids"],
  birthDate: ["date de naissance", "naissance", "ne le", "née le", "dob"],
  conditions: ["pathologies", "antecedents", "antécédents"],
  treatments: ["traitements"],
  history: ["historique"],
  animalNotes: ["notes", "commentaire", "remarques", "observations"],
};

export function normalizeHeader(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

/**
 * Devine la correspondance colonne → champ Animéo à partir des en-têtes du
 * fichier : chaque colonne n'est affectée qu'à un seul champ, et chaque
 * champ ne reçoit qu'une seule colonne (la première correspondance
 * rencontrée).
 */
export function guessMapping(headers: string[]): Partial<Record<ImportField, number>> {
  const mapping: Partial<Record<ImportField, number>> = {};
  const assignedFields = new Set<ImportField>();
  const fields = Object.keys(HEADER_SYNONYMS) as ImportField[];
  const normalizedSynonyms = new Map<ImportField, string[]>(
    fields.map((field) => [field, HEADER_SYNONYMS[field].map(normalizeHeader)]),
  );

  headers.forEach((rawHeader, index) => {
    const normalizedHeader = normalizeHeader(rawHeader);
    if (!normalizedHeader) return;

    for (const field of fields) {
      if (assignedFields.has(field)) continue;
      if (normalizedSynonyms.get(field)!.includes(normalizedHeader)) {
        mapping[field] = index;
        assignedFields.add(field);
        break;
      }
    }
  });

  return mapping;
}
