import "server-only";
import { prisma } from "@/lib/db";
import { organizationBlockOf } from "@/lib/organization-status";

/**
 * L'espace est-il fermé à ses membres (suspendu, effacement programmé) ?
 * Faux pour un compte sans espace (plateforme). Voir organization-status.ts.
 */
export async function organizationBlocked(organizationId: string | null): Promise<boolean> {
  if (!organizationId) return false;
  const organization = await prisma.organization.findUnique({ where: { id: organizationId }, select: { suspendedAt: true, deletionScheduledFor: true } });
  return organizationBlockOf(organization) !== null;
}
