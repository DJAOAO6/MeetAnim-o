"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { platformAccess } from "@/lib/platform/access";
import { purgeOrganization } from "@/lib/platform/organization-deletion";
import { DELETION_DELAY_MS, DELETION_REASONS, organizationHash, slugHash, type DeletionReasonKey } from "@/lib/deletion-plan";
import { getEmailProvider } from "@/lib/email/provider";
import { deletionScheduledTemplate } from "@/lib/email/templates";

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

export type DeletionInventory = { users: number; clients: number; animals: number; appointments: number; documents: number };

/** Ce que la suppression effacera, en volumes : affiché avant de confirmer. */
export async function getDeletionInventoryAction(organizationId: string): Promise<{ ok: true; inventory: DeletionInventory } | { ok: false; error: string }> {
  const access = await platformAccess();
  if (!access.ok) return { ok: false, error: ACCESS_ERROR };
  const where = { organizationId };
  const [users, clients, animals, appointments, studioDocuments, animalDocuments] = await Promise.all([
    prisma.user.count({ where }),
    prisma.client.count({ where }),
    prisma.animal.count({ where }),
    prisma.appointment.count({ where }),
    prisma.studioDocument.count({ where }),
    prisma.animalDocument.count({ where }),
  ]);
  return { ok: true, inventory: { users, clients, animals, appointments, documents: studioDocuments + animalDocuments } };
}

/** Le nom de l'espace, tapé à l'identique : la confirmation d'un geste irréversible. */
async function confirmedOrganization(organizationId: string, typedName: string) {
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { id: true, name: true, suspendedAt: true, deletionScheduledFor: true, businessProfiles: { select: { slug: true }, take: 1 } },
  });
  if (!organization) return { ok: false as const, error: "Cet espace n’existe plus." };
  if (typedName.trim() !== organization.name.trim()) return { ok: false as const, error: "Le nom saisi ne correspond pas exactement à celui de l’espace." };
  return { ok: true as const, organization };
}

function isDeletionReason(value: string): value is DeletionReasonKey {
  return Object.hasOwn(DELETION_REASONS, value);
}

/**
 * Programme l'effacement définitif dans 7 jours (décision D9) : l'espace est
 * suspendu aussitôt, le professionnel prévenu par email, et la suppression
 * reste annulable jusque-là. La preuve (DeletionRecord) est créée dès
 * maintenant, sans donnée personnelle, et complétée à l'effacement.
 */
export async function scheduleOrganizationDeletionAction(organizationId: string, reason: string, typedName: string): Promise<OrganizationStatusResult> {
  const access = await platformAccess();
  if (!access.ok) return { ok: false, error: ACCESS_ERROR };
  if (!isDeletionReason(reason)) return { ok: false, error: "Choisissez le motif de la suppression." };
  if (access.user.organizationId === organizationId) return { ok: false, error: "Vous ne pouvez pas supprimer votre propre espace." };
  const confirmed = await confirmedOrganization(organizationId, typedName);
  if (!confirmed.ok) return confirmed;
  if (confirmed.organization.deletionScheduledFor) return { ok: false, error: "Une suppression est déjà programmée." };

  const now = new Date();
  const scheduledFor = new Date(now.getTime() + DELETION_DELAY_MS);
  const slug = confirmed.organization.businessProfiles[0]?.slug;
  const hash = organizationHash(organizationId);
  const alreadySuspended = Boolean(confirmed.organization.suspendedAt);
  await prisma.$transaction([
    prisma.organization.update({
      where: { id: organizationId },
      data: {
        deletionScheduledFor: scheduledFor,
        ...(alreadySuspended ? {} : { suspendedAt: now, suspendedReason: "Suppression programmée", suspendedByUserId: access.user.id }),
      },
    }),
    prisma.session.deleteMany({ where: { user: { organizationId } } }),
    prisma.deletionRecord.upsert({
      where: { organizationHash: hash },
      create: { organizationHash: hash, slugHash: slug ? slugHash(slug) : null, reason, requestedAt: now, requestedByUserId: access.user.id },
      update: { reason, requestedAt: now, requestedByUserId: access.user.id, purgedAt: null },
    }),
  ]);

  // Le professionnel est prévenu : les administrateurs actifs de l'espace.
  const admins = await prisma.user.findMany({ where: { organizationId, role: "ADMIN", active: true }, select: { email: true } });
  const dateLabel = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "Europe/Paris" }).format(scheduledFor);
  for (const admin of admins) {
    try {
      await getEmailProvider().send({ to: admin.email, ...deletionScheduledTemplate({ organizationName: confirmed.organization.name, dateLabel, supportEmail: process.env.SUPPORT_EMAIL }) });
    } catch {
      // L'envoi peut échouer : la suppression reste programmée, et visible sur la plateforme.
    }
  }

  await logAudit({ userId: access.user.id, impersonatorId: null, organizationId, action: "ORGANIZATION_DELETION_SCHEDULED", entityType: "Organization", entityId: organizationId, metadata: { reason, scheduledFor: scheduledFor.toISOString() } });
  revalidatePath("/plateforme");
  return { ok: true };
}

/** Annule la suppression programmée. L'espace reste suspendu : il se réactive à part. */
export async function cancelOrganizationDeletionAction(organizationId: string): Promise<OrganizationStatusResult> {
  const access = await platformAccess();
  if (!access.ok) return { ok: false, error: ACCESS_ERROR };
  const organization = await prisma.organization.findUnique({ where: { id: organizationId }, select: { deletionScheduledFor: true } });
  if (!organization) return { ok: false, error: "Cet espace n’existe plus." };
  if (!organization.deletionScheduledFor) return { ok: false, error: "Aucune suppression n’est programmée." };

  await prisma.$transaction([
    prisma.organization.update({ where: { id: organizationId }, data: { deletionScheduledFor: null } }),
    prisma.deletionRecord.deleteMany({ where: { organizationHash: organizationHash(organizationId), purgedAt: null } }),
  ]);
  await logAudit({ userId: access.user.id, impersonatorId: null, organizationId, action: "ORGANIZATION_DELETION_CANCELLED", entityType: "Organization", entityId: organizationId });
  revalidatePath("/plateforme");
  return { ok: true };
}

/**
 * « Effacer immédiatement » : pour une demande explicite du professionnel.
 * Double confirmation : à l'écran, puis ici le nom exact de l'espace et la
 * mention de l'effacement immédiat.
 */
export async function purgeOrganizationNowAction(organizationId: string, typedName: string, immediateConfirmed: boolean): Promise<OrganizationStatusResult> {
  const access = await platformAccess();
  if (!access.ok) return { ok: false, error: ACCESS_ERROR };
  if (!immediateConfirmed) return { ok: false, error: "Confirmez l’effacement immédiat." };
  if (access.user.organizationId === organizationId) return { ok: false, error: "Vous ne pouvez pas supprimer votre propre espace." };
  const confirmed = await confirmedOrganization(organizationId, typedName);
  if (!confirmed.ok) return confirmed;

  const result = await purgeOrganization(organizationId, { requestedByUserId: access.user.id, reason: "PROFESSIONAL_REQUEST" });
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath("/plateforme");
  return { ok: true };
}
