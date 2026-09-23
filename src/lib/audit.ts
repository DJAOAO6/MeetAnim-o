import "server-only";
import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { getCurrentUser } from "@/lib/auth/dal";

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
  | "CALENDAR_FEED_TOKEN_REGENERATED"
  | "CLIENTS_IMPORTED"
  | "CLIENT_IMPORT_UNDONE"
  | "DOCUMENT_CREATED"
  | "DOCUMENT_FINALIZED"
  | "DOCUMENT_DELETED"
  | "ASSISTANCE_STARTED"
  | "ASSISTANCE_ENDED"
  | "INVITATION_SENT"
  | "INVITATION_REVOKED"
  | "ORGANIZATION_CREATED"
  | "ONBOARDING_COMPLETED";

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
  /**
   * Qui agit réellement, quand ce n'est pas `userId` : le compte de
   * plateforme qui assiste un professionnel. Déduit de la session en cours
   * si l'appelant ne le précise pas — de sorte qu'aucune action faite
   * pendant une assistance ne puisse échapper à cette attribution.
   */
  impersonatorId?: string | null;
}): Promise<void> {
  const impersonatorId = entry.impersonatorId !== undefined
    ? entry.impersonatorId
    : (await getCurrentUser().catch(() => null))?.assistance?.impersonatorId ?? null;

  // Le journal appartient au cabinet dont l'action émane : c'est lui qui le
  // consulte, et la super-administration (phase 7) devra pouvoir dire chez
  // qui chaque action a eu lieu.
  const organizationId = entry.userId
    ? (await prisma.user.findUnique({ where: { id: entry.userId }, select: { organizationId: true } }))?.organizationId ?? null
    : null;

  await prisma.auditLog.create({
    data: {
      userId: entry.userId ?? null,
      organizationId,
      impersonatorId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      metadata: entry.metadata,
      ipAddress: await requestIp(),
    },
  });
}
