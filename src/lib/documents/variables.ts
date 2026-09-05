// Studio de documents — variables dynamiques Animéo (étape 3). Registre pur
// (aucune dépendance DB directe) : le contexte est résolu une fois côté
// serveur (documents-actions.ts, à partir des vraies fiches liées au
// document) puis passé tel quel au client, jamais recalculé depuis zéro
// dans le navigateur.

export type DocumentVariableContext = {
  professional: { company: string; phone: string; email: string; address: string } | null;
  client: { firstName: string; lastName: string; phone: string; email: string; address: string } | null;
  animal: { name: string; species: string; breed: string; sex: string; weight: string; birthDate: string | null } | null;
  appointment: { date: string; start: string; serviceName: string; location: string } | null;
};

export type DocumentVariableDefinition = {
  token: string;
  label: string;
  group: "Professionnel" | "Propriétaire" | "Animal" | "Rendez-vous";
};

// Uniquement des champs réellement présents sur Client/Animal/Appointment/
// BusinessProfile (voir prisma/schema.prisma) — jamais un champ inventé.
export const documentVariables: DocumentVariableDefinition[] = [
  { token: "professional.company", label: "Nom du cabinet", group: "Professionnel" },
  { token: "professional.phone", label: "Téléphone du cabinet", group: "Professionnel" },
  { token: "professional.email", label: "Email du cabinet", group: "Professionnel" },
  { token: "professional.address", label: "Adresse du cabinet", group: "Professionnel" },

  { token: "client.firstName", label: "Prénom du propriétaire", group: "Propriétaire" },
  { token: "client.lastName", label: "Nom du propriétaire", group: "Propriétaire" },
  { token: "client.phone", label: "Téléphone du propriétaire", group: "Propriétaire" },
  { token: "client.email", label: "Email du propriétaire", group: "Propriétaire" },
  { token: "client.address", label: "Adresse du propriétaire", group: "Propriétaire" },

  { token: "animal.name", label: "Nom de l’animal", group: "Animal" },
  { token: "animal.species", label: "Espèce", group: "Animal" },
  { token: "animal.breed", label: "Race", group: "Animal" },
  { token: "animal.sex", label: "Sexe", group: "Animal" },
  { token: "animal.weight", label: "Poids", group: "Animal" },
  { token: "animal.birthDate", label: "Date de naissance", group: "Animal" },

  { token: "appointment.date", label: "Date du rendez-vous", group: "Rendez-vous" },
  { token: "appointment.start", label: "Heure du rendez-vous", group: "Rendez-vous" },
  { token: "appointment.serviceName", label: "Prestation", group: "Rendez-vous" },
  { token: "appointment.location", label: "Lieu du rendez-vous", group: "Rendez-vous" },
];

/**
 * "animal.name" -> "Oslo", ou "" si le document n'a pas d'animal lié, ou si
 * le token ne correspond à aucun champ connu — jamais une exception qui
 * casserait le rendu de tout le document pour une seule variable orpheline.
 */
export function resolveVariable(token: string, context: DocumentVariableContext): string {
  const [entity, field] = token.split(".");
  const source = context[entity as keyof DocumentVariableContext] as Record<string, unknown> | null;
  if (!source) return "";
  const value = source[field];
  return typeof value === "string" ? value : "";
}

export function labelForVariable(token: string): string {
  return documentVariables.find((variable) => variable.token === token)?.label ?? token;
}
