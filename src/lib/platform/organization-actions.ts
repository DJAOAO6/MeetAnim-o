"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { platformAccess } from "@/lib/platform/access";

const REASON_MIN_LENGTH = 5;
const REASON_MAX_LENGTH = 300;

export type OrganizationStatusResult = { ok: true } | { ok: false; error: string };

const ACCESS_ERROR = "Accès réservé à la super-administration, double authentification activée.";

/**
 * Suspend un espace professionnel : plus personne ne s'y connecte, sa page
 * publique est fermée, aucune tâche automatique ne part plus en son nom.
 * Réversible (reactivateOrganizationAction).
 *
 * Les effets tiennent côté serveur, au même contrôle (organization-status.ts) :
 * sessions de l'espace supprimées ici, puis refus à la connexion, à la
 * réinitialisation de mot de passe, dans getCurrentUser, dbForSlug, le
 * planificateur, le flux d'agenda, et toute écriture dans l'espace.
 */
export async function suspendOrganizationAction(organizationId: string, rawReason: string): Promise<OrganizationStatusResult> {
  const access = await platformAccess();
  if (!access.ok) return { ok: false, error: ACCESS_ERROR };

  const reason = rawReason.trim();
  if (reason.length < REASON_MIN_LENGTH) return { ok: false, error: "Indiquez le motif de la suspension : il sera inscrit au journal." };
  if (reason.length > REASON_MAX_LENGTH) return { ok: false, error: "Motif trop long." };

  const organization = await prisma.organization.findUnique({ where: { id: organizationId }, select: { id: true, suspendedAt: true } });
  if (!organization) return { ok: false, error: "Cet espace n’existe plus." };
  if (organization.suspendedAt) return { ok: false, error: "Cet espace est déjà suspendu." };
  // Le compte qui suspend ne se coupe pas lui-même de son propre espace.
  if (access.user.organizationId === organizationId) return { ok: false, error: "Vous ne pouvez pas suspendre votre propre espace." };

  await prisma.$transaction([
    prisma.organization.update({
      where: { id: organizationId },
      data: { suspendedAt: new Date(), suspendedReason: reason, suspendedByUserId: access.user.id },
    }),
    // Déconnexion immédiate de tous les membres, assistances comprises.
    prisma.session.deleteMany({ where: { user: { organizationId } } }),
  ]);

  await logAudit({ userId: access.user.id, impersonatorId: null, organizationId, action: "ORGANIZATION_SUSPENDED", entityType: "Organization", entityId: organizationId, metadata: { reason } });
  revalidatePath("/plateforme");
  return { ok: true };
}

/** Lève la suspension. Une suppression programmée, elle, s'annule à part (phase 3). */
export async function reactivateOrganizationAction(organizationId: string): Promise<OrganizationStatusResult> {
  const access = await platformAccess();
  if (!access.ok) return { ok: false, error: ACCESS_ERROR };

  const organization = await prisma.organization.findUnique({ where: { id: organizationId }, select: { suspendedAt: true, deletionScheduledFor: true } });
  if (!organization) return { ok: false, error: "Cet espace n’existe plus." };
  if (!organization.suspendedAt) return { ok: false, error: "Cet espace n’est pas suspendu." };
  if (organization.deletionScheduledFor) return { ok: false, error: "Une suppression est programmée : annulez-la d’abord." };

  await prisma.organization.update({ where: { id: organizationId }, data: { suspendedAt: null, suspendedReason: null, suspendedByUserId: null } });
  await logAudit({ userId: access.user.id, impersonatorId: null, organizationId, action: "ORGANIZATION_REACTIVATED", entityType: "Organization", entityId: organizationId });
  revalidatePath("/plateforme");
  return { ok: true };
}
