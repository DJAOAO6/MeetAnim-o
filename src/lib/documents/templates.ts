import type { StudioDocumentTemplateSummary } from "@/data/documents";

/**
 * Sélection automatique du modèle (étape 3) : un modèle Animéo dont
 * `species` correspond exactement à l'espèce de l'animal, sinon le premier
 * modèle sans espèce (générique), sinon aucun modèle (document vierge) —
 * jamais un modèle choisi au hasard. Utilisée dès qu'un document est créé
 * avec un animal déjà connu (fiche animal, rendez-vous — étape 5).
 */
export function pickDefaultTemplate(species: string | null | undefined, templates: StudioDocumentTemplateSummary[]): StudioDocumentTemplateSummary | null {
  if (species) {
    const bySpecies = templates.find((template) => template.species === species);
    if (bySpecies) return bySpecies;
  }
  return templates.find((template) => template.species === null) ?? null;
}
