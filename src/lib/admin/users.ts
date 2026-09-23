import "server-only";
import { prisma } from "@/lib/db";
import { currentOrganizationId } from "@/lib/organization";

/**
 * Les comptes du cabinet courant. Les comptes ne sont pas cloisonnés d'office
 * — un compte de plateforme n'appartient à aucun cabinet —, le filtre est
 * donc explicite : un administrateur gère son équipe, pas celle des autres.
 */
export async function getUsers() {
  const organizationId = await currentOrganizationId();
  return prisma.user.findMany({ where: { organizationId }, orderBy: [{ active: "desc" }, { lastName: "asc" }] });
}

export async function getAuditLog(limit = 100) {
  const organizationId = await currentOrganizationId();
  return prisma.auditLog.findMany({
    where: { organizationId },
    include: {
      user: { select: { firstName: true, lastName: true, email: true } },
      impersonator: { select: { firstName: true, lastName: true } },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
