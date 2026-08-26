export type AdminUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: "ADMIN" | "PRACTITIONER" | "SECRETARY";
  active: boolean;
  twoFactorEnabled: boolean;
  lastLoginAt: string | null;
  createdAt: string;
};

export type AuditLogEntry = {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  userLabel: string;
  createdAt: string;
};

export const roleLabels: Record<AdminUser["role"], string> = {
  ADMIN: "Administrateur",
  PRACTITIONER: "Praticien",
  SECRETARY: "Secrétariat",
};

export const auditActionLabels: Record<string, string> = {
  LOGIN_SUCCEEDED: "Connexion réussie",
  LOGIN_FAILED: "Tentative de connexion échouée",
  LOGOUT: "Déconnexion",
  PASSWORD_RESET_REQUESTED: "Réinitialisation de mot de passe demandée",
  PASSWORD_RESET_COMPLETED: "Mot de passe réinitialisé",
  TWO_FACTOR_CODE_SENT: "Code de vérification envoyé",
  TWO_FACTOR_VERIFIED: "Vérification en deux étapes réussie",
  TWO_FACTOR_FAILED: "Vérification en deux étapes échouée",
  CLIENT_VIEWED: "Fiche client consultée",
  CLIENT_CREATED: "Fiche client créée",
  CLIENT_UPDATED: "Fiche client modifiée",
  CLIENT_DELETED: "Fiche client supprimée",
  CLIENT_DATA_EXPORTED: "Données client exportées",
  USER_CREATED: "Compte créé",
  USER_UPDATED: "Compte modifié",
  USER_DEACTIVATED: "Compte désactivé",
};
