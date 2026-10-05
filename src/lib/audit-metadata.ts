import { pseudonymize } from "@/lib/privacy";

/**
 * Métadonnées du journal d'audit pour les actions qui touchent à une
 * personne. Le journal dit ce qui s'est passé et sur quelle entité (son
 * identifiant est déjà dans entityId) — jamais l'email, le nom ou l'adresse
 * de quelqu'un : ces lignes survivent à la fiche qu'elles décrivent, et
 * certaines (connexions échouées, plateforme) n'appartiennent à aucun espace.
 */

/** Connexion échouée : une empreinte de l'adresse tapée, pour rapprocher des tentatives. */
export function loginFailedMetadata(email: string) {
  return { emailHash: pseudonymize(email) };
}

/** Modification d'un compte : quels champs ont changé, pas leurs valeurs. */
export function accountChangeMetadata(before: { firstName: string; lastName: string; email: string }, after: { firstName: string; lastName: string; email: string }) {
  const changed = (["firstName", "lastName", "email"] as const).filter((field) => before[field] !== after[field]);
  return { changed };
}

/** Suppression d'un compte : le fait, sans l'adresse supprimée. */
export function accountDeletedMetadata() {
  return { deleted: true };
}

/** Invitation envoyée : l'identifiant de l'invitation est dans entityId. */
export function invitationSentMetadata(emailSent: boolean) {
  return { emailSent };
}

/** Agenda connecté : le prestataire, pas l'adresse du compte Google. */
export function calendarConnectedMetadata() {
  return { provider: "GOOGLE" };
}

/** Animal supprimé : sa fiche client, pas son nom. */
export function animalDeletedMetadata(clientId: string) {
  return { clientId };
}
