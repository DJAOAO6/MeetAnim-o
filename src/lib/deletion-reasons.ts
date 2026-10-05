/**
 * Motifs d'une suppression d'espace (C9), en catégories : jamais de texte
 * libre, qui pourrait contenir une donnée personnelle. Sans dépendance
 * serveur : l'écran de la plateforme les affiche.
 */
export const DELETION_REASONS = {
  PROFESSIONAL_REQUEST: "Demande du professionnel",
  CONTRACT_END: "Fin de contrat",
  FRAUD: "Compte frauduleux",
  OTHER: "Autre",
} as const;

export type DeletionReasonKey = keyof typeof DELETION_REASONS;
