"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/dal";
import { hasPermission } from "@/lib/auth/permissions";
import { logAudit } from "@/lib/audit";
import { notifyPlatformOfVerificationRequest } from "@/lib/platform/verification-notify";
import { dbFor } from "@/lib/db";
import { registrationNumberTaken, requestVerificationAgain, verificationStateOf } from "@/lib/organization-access";
import { REGISTRATION_NUMBER_REQUIRED_ERROR, REGISTRATION_NUMBER_TAKEN_ERROR, normalizeRegistrationNumber } from "@/lib/registration-number";

export type ResubmitVerificationResult = { ok: true } | { ok: false; error: string };

/**
 * Numéro RNA refusé : le professionnel le corrige et redemande la
 * vérification. L'espace repasse en attente (`PENDING`). Seul chemin
 * d'écriture ouvert à un espace refusé.
 */
export async function resubmitVerificationAction(rawNumber: string): Promise<ResubmitVerificationResult> {
  const user = await requireUser({ allowUnverified: true });
  if (!user.organizationId) return { ok: false, error: "Ce compte n’appartient à aucun espace professionnel." };
  if (!hasPermission(user, "MANAGE_PUBLIC_SETTINGS")) return { ok: false, error: "Seul un administrateur de l’espace peut redemander la vérification." };

  const organization = await verificationStateOf(user.organizationId);
  if (organization.verificationStatus !== "REJECTED") return { ok: false, error: "Aucune vérification à redemander : votre numéro est déjà en cours de vérification." };

  const registrationNumber = rawNumber.trim();
  if (!normalizeRegistrationNumber(registrationNumber)) return { ok: false, error: REGISTRATION_NUMBER_REQUIRED_ERROR };
  if (await registrationNumberTaken(registrationNumber, user.organizationId)) return { ok: false, error: REGISTRATION_NUMBER_TAKEN_ERROR };

  const db = dbFor(user.organizationId);
  const profile = await db.businessProfile.findFirst({ select: { id: true } });
  if (!profile) return { ok: false, error: "Le profil de l’espace est introuvable." };
  try {
    await db.businessProfile.update({ where: { id: profile.id }, data: { registrationNumber } });
  } catch (error) {
    if (JSON.stringify(error).includes("registrationNumber")) return { ok: false, error: REGISTRATION_NUMBER_TAKEN_ERROR };
    throw error;
  }
  if (await requestVerificationAgain(user.organizationId)) {
    await logAudit({ userId: user.id, action: "VERIFICATION_REQUESTED", entityType: "Organization", entityId: user.organizationId });
    await notifyPlatformOfVerificationRequest(user.organizationId);
  }

  revalidatePath("/dashboard/verification");
  return { ok: true };
}
