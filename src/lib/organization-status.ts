/**
 * Un espace professionnel est-il fermé, et pourquoi ?
 *
 * Un seul endroit pour toutes les raisons, pour que chaque porte d'entrée —
 * session, connexion, page publique, tâches de fond, flux d'agenda — pose la
 * même question au même endroit. Deux degrés :
 *
 * - fermé à ses membres (`organizationBlockOf`) : la suspension par la
 *   plateforme, et l'effacement programmé (qui suspend aussi). Plus de
 *   connexion du tout ;
 * - en attente de vérification (`verificationGateOf`, chantier C4) : le
 *   numéro RNA n'est pas encore validé, ou a été refusé. On se connecte,
 *   mais on ne voit que la page de vérification, et la page publique est
 *   fermée (`publicPageClosed`).
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

type VerificationStatus = "NOT_REQUIRED" | "PENDING" | "VERIFIED" | "REJECTED";

export type VerificationGate = "verification_pending" | "verification_rejected";

/** L'espace attend-il la vérification de son numéro RNA ? */
export function verificationGateOf(organization: { verificationStatus: VerificationStatus } | null | undefined): VerificationGate | null {
  if (organization?.verificationStatus === "PENDING") return "verification_pending";
  if (organization?.verificationStatus === "REJECTED") return "verification_rejected";
  return null;
}

/**
 * La page publique de l'espace est-elle fermée ? Configuration pas finie,
 * espace fermé, ou numéro pas vérifié : le lien ne mène à rien, comme un
 * lien inconnu, et rien ne dit pourquoi.
 */
export function publicPageClosed(organization: (OrganizationStatusFields & { onboardedAt: Date | null; verificationStatus: VerificationStatus }) | null | undefined): boolean {
  if (!organization?.onboardedAt) return true;
  return organizationBlockOf(organization) !== null || verificationGateOf(organization) !== null;
}

/**
 * Filtre Prisma : les espaces où les tâches de fond travaillent. Ni fermés,
 * ni en attente de vérification (rien à y rappeler ni synchroniser).
 */
export const OPEN_ORGANIZATION_WHERE = {
  suspendedAt: null,
  deletionScheduledFor: null,
  verificationStatus: { notIn: ["PENDING", "REJECTED"] as VerificationStatus[] },
};

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
