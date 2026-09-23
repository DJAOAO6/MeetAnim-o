import "server-only";
import { prisma } from "@/lib/db";
import { hashToken } from "@/lib/auth/tokens";

/**
 * Invitations à ouvrir un cabinet (multi-comptes, phase 4).
 *
 * L'inscription n'est pas publique : un compte de plateforme invite, par
 * e-mail, un professionnel qui crée alors son cabinet. Le lien porte un jeton
 * aléatoire dont seule l'empreinte est conservée en base — une copie de la
 * base ne permet donc pas d'ouvrir un cabinet à la place de l'invité.
 */

/** Assez pour laisser le temps de lire son courrier, pas assez pour qu'un lien oublié reste ouvert. */
export const INVITATION_VALIDITY_DAYS = 7;
export const INVITATION_DURATION_MS = INVITATION_VALIDITY_DAYS * 24 * 60 * 60 * 1000;

export function invitationUrl(token: string): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${appUrl}/inscription/${token}`;
}

export type InvitationLookup =
  | { ok: true; invitation: { id: string; email: string; organizationName: string; expiresAt: Date } }
  | { ok: false; reason: "unknown" | "used" | "revoked" | "expired" };

/**
 * L'invitation désignée par un lien, si elle peut encore servir. Le motif du
 * refus est rendu pour que la page puisse dire quoi faire : un lien déjà
 * utilisé mène à la connexion, un lien expiré à une nouvelle demande.
 */
export async function findInvitation(token: string): Promise<InvitationLookup> {
  if (!/^[a-f0-9]{64}$/.test(token)) return { ok: false, reason: "unknown" };
  const invitation = await prisma.invitation.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!invitation) return { ok: false, reason: "unknown" };
  if (invitation.usedAt) return { ok: false, reason: "used" };
  if (invitation.revokedAt) return { ok: false, reason: "revoked" };
  if (invitation.expiresAt.getTime() <= Date.now()) return { ok: false, reason: "expired" };
  return { ok: true, invitation: { id: invitation.id, email: invitation.email, organizationName: invitation.organizationName, expiresAt: invitation.expiresAt } };
}

export type InvitationStatus = "pending" | "used" | "revoked" | "expired";

export function invitationStatus(invitation: { usedAt: Date | null; revokedAt: Date | null; expiresAt: Date }): InvitationStatus {
  if (invitation.usedAt) return "used";
  if (invitation.revokedAt) return "revoked";
  if (invitation.expiresAt.getTime() <= Date.now()) return "expired";
  return "pending";
}

/** Les dernières invitations, pour la super-administration. */
export async function getRecentInvitations(limit = 20) {
  const rows = await prisma.invitation.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true, email: true, organizationName: true, createdAt: true, expiresAt: true, usedAt: true, revokedAt: true,
      createdBy: { select: { firstName: true, lastName: true } },
      organization: { select: { name: true } },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    organizationName: row.organization?.name ?? row.organizationName,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    status: invitationStatus(row),
    createdByName: row.createdBy ? `${row.createdBy.firstName} ${row.createdBy.lastName}`.trim() : null,
  }));
}
