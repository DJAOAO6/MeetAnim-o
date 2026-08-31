import "server-only";
import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";

type AuditAction =
  | "LOGIN_SUCCEEDED"
  | "LOGIN_FAILED"
  | "LOGOUT"
  | "PASSWORD_RESET_REQUESTED"
  | "PASSWORD_RESET_COMPLETED"
  | "TWO_FACTOR_CODE_SENT"
  | "TWO_FACTOR_VERIFIED"
  | "TWO_FACTOR_FAILED"
  | "CLIENT_VIEWED"
  | "CLIENT_CREATED"
  | "CLIENT_UPDATED"
  | "CLIENT_DELETED"
  | "CLIENT_DATA_EXPORTED"
  | "USER_CREATED"
  | "USER_UPDATED"
  | "USER_DEACTIVATED"
  | "APPOINTMENT_CREATED"
  | "APPOINTMENT_UPDATED"
  | "APPOINTMENT_STATUS_CHANGED"
  | "ANIMAL_DELETED"
  | "ANIMAL_UPDATED"
  | "REMINDER_CREATED"
  | "REMINDER_UPDATED"
  | "REMINDER_SENT"
  | "REMINDER_IGNORED"
  | "CALENDAR_CONNECTED"
  | "CALENDAR_DISCONNECTED"
  | "CALENDAR_SETTINGS_UPDATED"
  | "CALENDAR_FEED_TOKEN_REGENERATED";

// AuditLog.ipAddress n'était jamais renseignée (AUDIT_COMPLET.md P2-29) —
// lue ici une fois pour tous les appelants plutôt que d'exiger que chacun
// des ~15 sites d'appel de logAudit() la passe explicitement.
async function requestIp(): Promise<string | null> {
  const headerList = await headers();
  return headerList.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
}

export async function logAudit(entry: {
  userId?: string | null;
  action: AuditAction;
  entityType?: string;
  entityId?: string;
  metadata?: Prisma.InputJsonValue;
}): Promise<void> {
  await prisma.auditLog.create({
    data: {
      userId: entry.userId ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      metadata: entry.metadata,
      ipAddress: await requestIp(),
    },
  });
}
