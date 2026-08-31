const FRENCH_NATIONAL_FORMAT = /^0[1-9](?:[\s.]?\d{2}){4}$/;
const FRENCH_E164_FORMAT = /^\+33[1-9]\d{8}$/;

/**
 * Convertit un numéro français saisi sous forme libre (national "0X XX XX XX
 * XX", avec espaces ou points, ou international "+33 X XX XX XX XX") en lien
 * `tel:` au format E.164. Retourne null pour tout numéro vide ou dans un
 * format non reconnu — l'appelant doit alors ne pas afficher de bouton
 * "Appeler" plutôt que d'en afficher un cassé (refonte tournées, phase 1.2).
 */
export function toTelHref(rawPhone: string): string | null {
  const trimmed = rawPhone.trim();
  if (!trimmed) return null;

  const compact = trimmed.replace(/[\s.-]/g, "");
  if (FRENCH_E164_FORMAT.test(compact)) return `tel:${compact}`;

  if (FRENCH_NATIONAL_FORMAT.test(trimmed)) {
    const digits = trimmed.replace(/[\s.]/g, "");
    return `tel:+33${digits.slice(1)}`;
  }

  return null;
}
