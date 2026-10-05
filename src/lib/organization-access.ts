import "server-only";
import { prisma } from "@/lib/db";
import { organizationBlockOf } from "@/lib/organization-status";
import { SLUG_QUARANTINE_MS, slugHash } from "@/lib/deletion-plan";
import { normalizeRegistrationNumber } from "@/lib/registration-number";

/**
 * L'espace est-il fermé à ses membres (suspendu, effacement programmé) ?
 * Faux pour un compte sans espace (plateforme). Voir organization-status.ts.
 */
export async function organizationBlocked(organizationId: string | null): Promise<boolean> {
  if (!organizationId) return false;
  const organization = await prisma.organization.findUnique({ where: { id: organizationId }, select: { suspendedAt: true, deletionScheduledFor: true } });
  return organizationBlockOf(organization) !== null;
}

/**
 * Le lien de réservation d'un espace effacé (ou dont l'effacement est
 * programmé) reste indisponible 6 mois : un nouvel espace ne doit pas
 * récupérer les visiteurs, les favoris et les liens partagés de l'ancien.
 */
export async function slugInQuarantine(slug: string, now: Date = new Date()): Promise<boolean> {
  const record = await prisma.deletionRecord.findFirst({
    where: { slugHash: slugHash(slug), OR: [{ purgedAt: null }, { purgedAt: { gt: new Date(now.getTime() - SLUG_QUARANTINE_MS) } }] },
    select: { id: true },
  });
  return record !== null;
}

export const SLUG_QUARANTINE_ERROR = "Ce lien a appartenu à un espace supprimé récemment : choisissez-en un autre.";


/**
 * Ce numéro RNA est-il déjà celui d'un autre espace ? Comparé comme l'index
 * unique de la base : en majuscules, sans espaces. Lu hors cloisonnement,
 * puisqu'il s'agit justement des autres espaces ; seule la réponse sort.
 */
export async function registrationNumberTaken(number: string | null | undefined, organizationId: string): Promise<boolean> {
  const normalized = normalizeRegistrationNumber(number);
  if (!normalized) return false;
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM "BusinessProfile"
    WHERE upper(regexp_replace("registrationNumber", '[[:space:]]', '', 'g')) = ${normalized} AND "organizationId" <> ${organizationId}
    LIMIT 1`;
  return rows.length > 0;
}

/** Où en est la vérification du numéro RNA d'un espace (page de vérification). */
export async function verificationStateOf(organizationId: string) {
  return prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { verificationStatus: true, verificationNote: true, onboardedAt: true } });
}

/**
 * Numéro corrigé après un refus : l'espace repasse en attente. Seulement
 * depuis un refus, pour que deux envois simultanés ne fassent qu'une
 * demande ; vrai si c'est celle-ci qui l'a faite.
 */
export async function requestVerificationAgain(organizationId: string): Promise<boolean> {
  const { count } = await prisma.organization.updateMany({ where: { id: organizationId, verificationStatus: "REJECTED" }, data: { verificationStatus: "PENDING", verificationNote: null } });
  return count > 0;
}
