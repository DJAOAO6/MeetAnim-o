import type { Metadata } from "next";
import { AdminView } from "@/components/admin/admin-view";
import { requireAdmin } from "@/lib/auth/dal";
import { getAuditLog, getUsers } from "@/lib/admin/users";

export const metadata: Metadata = { title: "Administration" };

export default async function AdminPage() {
  await requireAdmin();
  const [users, auditLog] = await Promise.all([getUsers(), getAuditLog()]);

  const safeUsers = users.map((user) => ({
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    active: user.active,
    twoFactorEnabled: user.twoFactorEnabled,
    lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
    createdAt: user.createdAt.toISOString(),
  }));

  const safeAuditLog = auditLog.map((entry) => ({
    id: entry.id,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    userLabel: entry.user ? `${entry.user.firstName} ${entry.user.lastName}` : "Système",
    createdAt: entry.createdAt.toISOString(),
  }));

  return <AdminView users={safeUsers} auditLog={safeAuditLog} />;
}
