import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { VerificationPending, VerificationRejected } from "@/components/verification/verification-screens";
import { requireUser } from "@/lib/auth/dal";
import { dbFor } from "@/lib/db";
import { verificationStateOf } from "@/lib/organization-access";

export const metadata: Metadata = { title: "Vérification" };

/**
 * Où attend un espace dont le numéro RNA n'est pas encore vérifié (chantier
 * C4) : c'est la seule page de l'espace professionnel qui lui soit ouverte.
 * Lue sans passer par `currentDb`, qui renverrait ici même.
 */
export default async function VerificationPage() {
  const user = await requireUser({ allowUnverified: true });
  if (!user.organizationId) redirect("/plateforme");

  const [organization, profile] = await Promise.all([
    verificationStateOf(user.organizationId),
    dbFor(user.organizationId).businessProfile.findFirst({ select: { registrationNumber: true } }),
  ]);

  if (organization.verificationStatus === "PENDING") return <VerificationPending registrationNumber={profile?.registrationNumber ?? null} />;
  if (organization.verificationStatus === "REJECTED") return <VerificationRejected note={organization.verificationNote} registrationNumber={profile?.registrationNumber ?? null} />;
  // Rien à attendre : retour à l'espace (ou à sa configuration).
  redirect(organization.onboardedAt ? "/dashboard" : "/dashboard/bienvenue");
}
