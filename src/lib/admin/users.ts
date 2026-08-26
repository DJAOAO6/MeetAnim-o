import "server-only";
import { prisma } from "@/lib/db";

export async function getUsers() {
  return prisma.user.findMany({ orderBy: [{ active: "desc" }, { lastName: "asc" }] });
}

export async function getAuditLog(limit = 100) {
  return prisma.auditLog.findMany({
    include: { user: { select: { firstName: true, lastName: true, email: true } } },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
