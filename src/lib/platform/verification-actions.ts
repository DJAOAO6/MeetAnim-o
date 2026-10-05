"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { platformAccess } from "@/lib/platform/access";
import { notifyVerificationDecision } from "@/lib/platform/verification-notify";

export type VerificationDecisionResult = { ok: true } | { ok: false; error: string };

const ACCESS_ERROR = "Accès réservé à la super-administration, double authentification activée.";
const REASON_MIN_LENGTH = 5;
const REASON_MAX_LENGTH = 500;

/**
 * Le numéro RNA d'un espace a été contrôlé à la main dans l'annuaire de
 * l'Ordre des vétérinaires : l'espace et sa page de rendez-vous s'ouvrent.
 */
export async function approveVerificationAction(organizationId: string): Promise<VerificationDecisionResult> {
  const access = await platformAccess();
  if (!access.ok) return { ok: false, error: ACCESS_ERROR };

  // Seulement depuis l'attente : deux décisions simultanées n'en font qu'une.
  const { count } = await prisma.organization.updateMany({
    where: { id: organizationId, verificationStatus: "PENDING" },
    data: { verificationStatus: "VERIFIED", verifiedAt: new Date(), verifiedByUserId: access.user.id, verificationNote: null },
  });
  if (count === 0) return { ok: false, error: "Cet espace n’attend pas de vérification." };

  const emails = await notifyVerificationDecision(organizationId, { approved: true });
  await logAudit({ userId: access.user.id, impersonatorId: null, organizationId, action: "VERIFICATION_APPROVED", entityType: "Organization", entityId: organizationId, metadata: { emailsSent: emails.sent, emailsFailed: emails.failed } });

  revalidatePath("/plateforme");
  const profile = await prisma.businessProfile.findFirst({ where: { organizationId }, select: { slug: true } });
  if (profile) revalidatePath(`/reserver/${profile.slug}`);
  return { ok: true };
}

/** Numéro refusé, motif obligatoire : il est montré au professionnel, qui peut corriger son numéro. */
export async function rejectVerificationAction(organizationId: string, rawReason: string): Promise<VerificationDecisionResult> {
  const access = await platformAccess();
  if (!access.ok) return { ok: false, error: ACCESS_ERROR };

  const reason = rawReason.trim();
  if (reason.length < REASON_MIN_LENGTH) return { ok: false, error: "Indiquez le motif du refus : il sera montré au professionnel." };
  if (reason.length > REASON_MAX_LENGTH) return { ok: false, error: "Motif trop long." };

  const { count } = await prisma.organization.updateMany({
    where: { id: organizationId, verificationStatus: "PENDING" },
    data: { verificationStatus: "REJECTED", verificationNote: reason, verifiedAt: null, verifiedByUserId: access.user.id },
  });
  if (count === 0) return { ok: false, error: "Cet espace n’attend pas de vérification." };

  const emails = await notifyVerificationDecision(organizationId, { approved: false, reason });
  // Le motif est sur l'espace (verificationNote) ; le journal garde la décision.
  await logAudit({ userId: access.user.id, impersonatorId: null, organizationId, action: "VERIFICATION_REJECTED", entityType: "Organization", entityId: organizationId, metadata: { emailsSent: emails.sent, emailsFailed: emails.failed } });

  revalidatePath("/plateforme");
  return { ok: true };
}
