/**
 * Un espace professionnel est-il fermé à ses membres, et pourquoi ?
 *
 * Un seul contrôle, plusieurs raisons : la suspension par la plateforme, et
 * l'effacement programmé (qui suspend aussi). D'autres raisons viendront
 * s'ajouter ici (par exemple un espace pas encore vérifié), pour que chaque
 * porte d'entrée — session, connexion, page publique, tâches de fond,
 * flux d'agenda — pose la même question au même endroit.
 */

export type OrganizationBlock = "suspended" | "deletion_scheduled";

export type OrganizationStatusFields = {
  suspendedAt: Date | null;
  deletionScheduledFor: Date | null;
};

/** La raison pour laquelle l'espace est fermé, ou null s'il est ouvert. */
export function organizationBlockOf(organization: OrganizationStatusFields | null | undefined): OrganizationBlock | null {
  if (!organization) return null;
  if (organization.deletionScheduledFor) return "deletion_scheduled";
  if (organization.suspendedAt) return "suspended";
  return null;
}

/** Filtre Prisma : les espaces ouverts. */
export const OPEN_ORGANIZATION_WHERE = { suspendedAt: null, deletionScheduledFor: null } as const;

/**
 * Message de connexion d'un compte dont l'espace est fermé. Il ne dit pas
 * pourquoi : le motif regarde la plateforme et le professionnel, pas
 * quiconque tape une adresse dans le formulaire.
 */
export function suspendedAccountMessage(supportEmail: string | undefined): string {
  const contact = supportEmail?.trim();
  return contact ? `Ce compte est suspendu. Contactez ${contact}.` : "Ce compte est suspendu. Contactez le support de 1002 Pattes.";
}

/** Erreur des écritures refusées dans un espace fermé (assistance en lecture seule). */
export const READ_ONLY_ORGANIZATION_ERROR = "Cet espace est suspendu : l’assistance est en lecture seule, aucune modification n’est enregistrée.";
