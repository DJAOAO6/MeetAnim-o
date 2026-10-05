import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSessionPayload } from "@/lib/auth/session";
import { normalizeModules, type ModuleKey } from "@/lib/modules";
import { organizationBlockOf, verificationGateOf, type VerificationGate } from "@/lib/organization-status";

export type CurrentUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: "ADMIN" | "PRACTITIONER" | "SECRETARY";
  permissions: string[];
  /**
   * Espace professionnel du compte (multi-comptes, phase 1). `null` pour un
   * compte de plateforme, qui n'appartient à aucun cabinet.
   */
  organizationId: string | null;
  /**
   * Modules ouverts à son espace, en plus du socle (src/lib/modules.ts).
   * Vide pour un compte sans espace.
   */
  modules: ModuleKey[];
  /** Compte de super-administration (phase 7). */
  platformAdmin: boolean;
  /** Annoncer les nouvelles demandes de rendez-vous par le teckel animé. */
  newRequestAnimation: boolean;
  twoFactorEnabled: boolean;
  /**
   * Espace suspendu par la plateforme (ou effacement programmé). Seule une
   * assistance y entre encore, en lecture seule.
   */
  organizationBlocked: boolean;
  /**
   * Numéro RNA de l'espace en attente de vérification, ou refusé (chantier
   * C4). Ses membres ne voient que la page de vérification ; une assistance
   * de la plateforme entre normalement.
   */
  verificationGate: VerificationGate | null;
  /**
   * Présent quand cette session est une assistance : un compte de plateforme
   * agit au nom de ce professionnel. L'interface l'affiche en permanence, et
   * le journal d'audit attribue chaque action à celui qui assiste.
   */
  assistance: {
    impersonatorId: string;
    impersonatorName: string;
    reason: string;
    expiresAt: Date;
  } | null;
};

/**
 * Vérification "sûre" (contrairement au proxy, qui ne fait qu'un contrôle
 * optimiste sur la présence d'un cookie valide) : relit l'utilisateur en
 * base et invalide la session si le mot de passe a changé depuis l'émission
 * du jeton, ou si le compte a été désactivé.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const payload = await getSessionPayload();
  if (!payload?.userId || !payload.sid) return null;

  // La session doit exister, appartenir à ce compte, ne pas être révoquée
  // (déconnexion) ni expirée : une seule lecture, utilisateur compris.
  const session = await prisma.session.findUnique({ where: { id: payload.sid }, include: { user: { include: { organization: { select: { modules: true, suspendedAt: true, deletionScheduledFor: true, verificationStatus: true } } } }, impersonator: true } });
  if (!session || session.userId !== payload.userId || session.revokedAt || session.expiresAt.getTime() <= Date.now()) return null;

  // Une assistance ne vaut que tant que celui qui assiste est toujours un
  // compte de plateforme actif : lui retirer ce rôle en cours de route coupe
  // l'assistance à la requête suivante.
  if (session.impersonatorId && (!session.impersonator?.platformAdmin || !session.impersonator.active)) return null;

  const user = session.user;
  if (!user.active) return null;

  // Espace suspendu : plus aucun accès pour ses membres, même avec une
  // session déjà ouverte ailleurs. Seule l'assistance de la plateforme y
  // entre encore — en lecture seule, les écritures étant refusées par le
  // client de l'espace (src/lib/db.ts).
  const organizationBlocked = organizationBlockOf(user.organization) !== null;
  if (organizationBlocked && !session.impersonatorId) return null;

  // Un jeton émis avant le dernier changement de mot de passe ne vaut plus.
  // `iat` est en secondes : la comparaison se fait à la seconde, sinon une
  // session ouverte dans la seconde même où le compte est créé (inscription
  // sur invitation) serait jugée antérieure à son propre mot de passe.
  if (payload.iat < Math.floor(user.passwordChangedAt.getTime() / 1000)) return null;

  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    permissions: user.permissions,
    organizationId: user.organizationId,
    modules: normalizeModules(user.organization?.modules ?? []),
    platformAdmin: user.platformAdmin,
    newRequestAnimation: user.newRequestAnimation,
    twoFactorEnabled: user.twoFactorEnabled,
    organizationBlocked,
    verificationGate: verificationGateOf(user.organization),
    assistance: session.impersonator
      ? {
          impersonatorId: session.impersonator.id,
          impersonatorName: `${session.impersonator.firstName} ${session.impersonator.lastName}`.trim(),
          reason: session.assistanceReason ?? "",
          expiresAt: session.expiresAt,
        }
      : null,
  };
});

/** Où va un membre d'un espace qui attend la vérification de son numéro RNA. */
export const VERIFICATION_PATH = "/dashboard/verification";

/**
 * Tant que le numéro RNA de son espace n'est pas vérifié, un membre ne voit
 * que la page de vérification. Appelé par chaque porte de l'espace
 * professionnel : `requireUser`, et l'accès aux données de l'espace
 * (`currentOrganizationId`, `readDb`) — pages et actions serveur comprises,
 * qu'aucune mise en page ne protège à elle seule. L'assistance de la
 * plateforme n'est pas retenue.
 */
export function redirectUnverified(user: CurrentUser | null): void {
  if (user?.verificationGate && !user.assistance) redirect(VERIFICATION_PATH);
}

/**
 * Le compte connecté, ou la page de connexion. `allowUnverified` : pour les
 * seuls chemins ouverts à un espace en attente de vérification (la mise en
 * page, la page de vérification et son action).
 */
export async function requireUser(options: { allowUnverified?: boolean } = {}): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (user) {
    if (!options.allowUnverified) redirectUnverified(user);
    return user;
  }

  // Un Server Component ne peut pas supprimer de cookie (réservé aux Server
  // Actions/Route Handlers) — si le jeton est cryptographiquement valide
  // mais rejeté par le contrôle base (compte désactivé, mot de passe changé
  // depuis), le contrôle optimiste du proxy le verrait comme valide et
  // renverrait vers /dashboard, créant une boucle infinie avec cette
  // redirection. Ce paramètre indique au proxy de supprimer le cookie au
  // lieu de lui faire confiance.
  const payload = await getSessionPayload();
  redirect(payload?.userId ? "/login?sessionExpired=1" : "/login");
}

export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect("/dashboard");
  return user;
}
