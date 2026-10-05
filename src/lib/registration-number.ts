/**
 * Numéro RNA (Registre national d'aptitude) et statut de vérification
 * (chantier C4). Règles pures, partagées par le formulaire et le serveur.
 *
 * Le logiciel ne vérifie aucun format : un compte de plateforme contrôle le
 * numéro à la main dans l'annuaire de l'Ordre des vétérinaires. Ici, on
 * dit seulement qui doit en donner un, et sous quelle forme on le compare.
 */

/** Métiers proposés dans le menu ; « Autre » ouvre un champ libre. */
export const PROFESSIONS = ["Ostéopathe animalier", "Comportementaliste", "Éducateur canin", "Toiletteur"] as const;

export const OTHER_PROFESSION = "Autre";

/**
 * Ce métier exige-t-il un numéro RNA ? Toute forme d'« ostéopathe » :
 * quelqu'un qui l'écrit lui-même dans « Autre » est aussi concerné.
 */
export function requiresRna(profession: string | null | undefined): boolean {
  return (profession ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().includes("osteopath");
}

/** Forme comparée (et indexée en base) : majuscules, sans espaces. */
export function normalizeRegistrationNumber(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, "").toUpperCase();
}

export const REGISTRATION_NUMBER_REQUIRED_ERROR = "Indiquez votre numéro RNA : il sera vérifié avant l’ouverture de votre espace.";
export const REGISTRATION_NUMBER_TAKEN_ERROR = "Ce numéro est déjà associé à un compte. Contactez-nous si c’est une erreur.";
export const REGISTRATION_NUMBER_LOCKED_ERROR = "Ce numéro a été vérifié : contactez le support pour le modifier.";

export type VerificationStatus = "NOT_REQUIRED" | "PENDING" | "VERIFIED" | "REJECTED";

/**
 * Le numéro d'un espace vérifié ne bouge plus : sinon la vérification ne
 * vaut rien. Un espace vérifié qui n'en avait pas encore (espace existant,
 * marqué vérifié par la migration) peut le saisir une fois.
 */
export function registrationNumberLocked(status: VerificationStatus, current: string | null | undefined): boolean {
  return status === "VERIFIED" && normalizeRegistrationNumber(current) !== "";
}

/** Où en est le numéro, pour le formulaire : à vérifier, à saisir une seule fois, ou figé. */
export type RegistrationNumberState = "toVerify" | "once" | "locked";

export function registrationNumberState(status: VerificationStatus, saved: string | null | undefined): RegistrationNumberState {
  if (registrationNumberLocked(status, saved)) return "locked";
  return status === "VERIFIED" ? "once" : "toVerify";
}

/**
 * Le problème d'un numéro soumis, hors doublon (vérifié en base) ; null si
 * rien à redire.
 */
export function registrationNumberProblem(input: { profession: string; next: string | null | undefined; current: string | null | undefined; status: VerificationStatus }): string | null {
  const next = normalizeRegistrationNumber(input.next);
  if (registrationNumberLocked(input.status, input.current) && next !== normalizeRegistrationNumber(input.current)) return REGISTRATION_NUMBER_LOCKED_ERROR;
  // Un espace déjà vérifié sans numéro n'est pas enfermé dehors pour autant.
  if (requiresRna(input.profession) && input.status !== "VERIFIED" && !next) return REGISTRATION_NUMBER_REQUIRED_ERROR;
  return null;
}
