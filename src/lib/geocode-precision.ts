/**
 * Précision d'une position géocodée, à partir de ce que dit le géocodeur
 * (Géoplateforme IGN) : le type de résultat et son score de confiance.
 *
 *  - EXACT  : le numéro de la rue a été trouvé, avec un score solide ;
 *  - STREET : la rue, sans le numéro (ou un numéro peu sûr) ;
 *  - CITY   : seulement la commune.
 *
 * Un résultat trop incertain n'est pas retenu (null) : mieux vaut un client
 * « sans position » qu'un client placé à un endroit faux présenté comme
 * vrai. Un score faible ne donne jamais EXACT.
 */
export type GeocodePrecision = "EXACT" | "STREET" | "CITY";

/** Score minimal pour qu'un numéro de rue vaille position exacte. */
export const EXACT_MIN_SCORE = 0.7;
/** Score minimal pour qu'une rue soit retenue. */
export const STREET_MIN_SCORE = 0.5;
/** Score minimal pour qu'une commune soit retenue. */
export const CITY_MIN_SCORE = 0.4;

export function classifyGeocode(type: string | undefined, score: number | undefined): GeocodePrecision | null {
  const confidence = score ?? 0;
  if (type === "housenumber") {
    if (confidence >= EXACT_MIN_SCORE) return "EXACT";
    return confidence >= STREET_MIN_SCORE ? "STREET" : null;
  }
  if (type === "street" || type === "locality") return confidence >= STREET_MIN_SCORE ? "STREET" : null;
  if (type === "municipality") return confidence >= CITY_MIN_SCORE ? "CITY" : null;
  return null;
}

/** Nom de commune comparable : sans accents, tirets ni casse (« Saint-Aubin » = « saint aubin »). */
export function normalizeCityName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLocaleLowerCase("fr-FR")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Le résultat est-il dans la bonne commune ? Protège des homonymes (« rue
 * de la République » existe partout) quand la fiche n'a pas de code postal.
 */
export function sameCity(expected: string, found: string): boolean {
  const a = normalizeCityName(expected);
  const b = normalizeCityName(found);
  if (!a || !b) return false;
  return a === b || b.startsWith(`${a} `) || a.startsWith(`${b} `);
}
