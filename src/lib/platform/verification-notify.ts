import "server-only";
import { prisma } from "@/lib/db";
import { getEmailProvider } from "@/lib/email/provider";
import { verificationApprovedTemplate, verificationRejectedTemplate, verificationRequestedTemplate } from "@/lib/email/templates";

/**
 * E-mails de la vérification du numéro RNA (chantier C4). Tous en
 * best-effort : un échec d'envoi n'annule jamais la décision ou la demande,
 * il est seulement compté (et inscrit au journal par l'appelant).
 */

/** Prévient les administrateurs actifs de l'espace de la décision. Renvoie combien d'envois ont échoué. */
export async function notifyVerificationDecision(organizationId: string, decision: { approved: true } | { approved: false; reason: string }): Promise<{ sent: number; failed: number }> {
  const organization = await prisma.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: { name: true, businessProfiles: { select: { slug: true }, take: 1 }, users: { where: { role: "ADMIN", active: true }, select: { email: true } } },
  });
  const content = decision.approved
    ? verificationApprovedTemplate({ organizationName: organization.name, slug: organization.businessProfiles[0]?.slug ?? "" })
    : verificationRejectedTemplate({ organizationName: organization.name, reason: decision.reason });

  let sent = 0;
  let failed = 0;
  for (const admin of organization.users) {
    try {
      await getEmailProvider().send({ to: admin.email, ...content });
      sent += 1;
    } catch (error) {
      failed += 1;
      // Sans l'adresse : le journal de l'application n'en garde pas.
      console.error("Vérification RNA : e-mail de décision non envoyé", { organizationId, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return { sent, failed };
}

/**
 * Prévient la super-administration d'une nouvelle demande, si une adresse
 * est réglée (VERIFICATION_NOTIFICATION_EMAIL) ; sinon rien.
 */
export async function notifyPlatformOfVerificationRequest(organizationId: string): Promise<void> {
  const to = process.env.VERIFICATION_NOTIFICATION_EMAIL?.trim();
  if (!to) return;
  try {
    const organization = await prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { name: true, businessProfiles: { select: { profession: true, registrationNumber: true }, take: 1 } },
    });
    const profile = organization.businessProfiles[0];
    await getEmailProvider().send({ to, ...verificationRequestedTemplate({ organizationName: organization.name, profession: profile?.profession ?? "", registrationNumber: profile?.registrationNumber ?? "" }) });
  } catch (error) {
    console.error("Vérification RNA : e-mail à la plateforme non envoyé", { organizationId, error: error instanceof Error ? error.message : String(error) });
  }
}
