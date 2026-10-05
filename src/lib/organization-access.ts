import "server-only";
import { prisma } from "@/lib/db";
import { organizationBlockOf } from "@/lib/organization-status";
import { SLUG_QUARANTINE_MS, slugHash } from "@/lib/deletion-plan";

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

