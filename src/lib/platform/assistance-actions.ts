"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { createSession, deleteSession, getSessionPayload } from "@/lib/auth/session";
import { getCurrentUser } from "@/lib/auth/dal";
import { logAudit } from "@/lib/audit";
import { platformAccess } from "@/lib/platform/access";

/**
 * Durée d'une assistance. Assez pour régler un problème, pas assez pour
 * qu'une session oubliée reste ouverte sur les données d'un professionnel.
 */
const ASSISTANCE_DURATION_MS = 30 * 60 * 1000;

const REASON_MIN_LENGTH = 10;
const REASON_MAX_LENGTH = 500;

export type AssistanceResult = { ok: false; error: string };

/**
 * Ouvre une assistance : le compte de plateforme agit désormais au nom de ce
 * professionnel, dans son espace, avec ses droits — et avec eux seulement.
 *
 * Ce n'est pas la session du professionnel : c'en est une nouvelle, à part,
 * courte, qui porte le motif et le nom de celui qui assiste. Le professionnel
 * garde ses propres sessions, intactes. La session de plateforme est
 * conservée pour y revenir en fin d'assistance.
 */
export async function startAssistanceAction(targetUserId: string, rawReason: string): Promise<AssistanceResult> {
  const access = await platformAccess();
  if (!access.ok) return { ok: false, error: "Accès réservé à la super-administration, double authentification activée." };
  const admin = access.user;

  const reason = rawReason.trim();
  if (reason.length < REASON_MIN_LENGTH) {
    return { ok: false, error: `Indiquez le motif de l'assistance (${REASON_MIN_LENGTH} caractères au moins) : il sera inscrit au journal de l'espace.` };
  }
  if (reason.length > REASON_MAX_LENGTH) return { ok: false, error: "Motif trop long." };

  const target = await prisma.user.findUnique({ where: { id: targetUserId } });
  if (!target || !target.active) return { ok: false, error: "Ce compte n'existe pas ou n'est plus actif." };
  if (target.id === admin.id) return { ok: false, error: "On n'assiste pas son propre compte." };
  // Un compte de plateforme n'en assiste pas un autre : ce serait un moyen
  // de cumuler des accès sans laisser de trace claire.
  if (target.platformAdmin) return { ok: false, error: "Ce compte est lui-même un compte de plateforme." };
  if (!target.organizationId) return { ok: false, error: "Ce compte n'appartient à aucun espace professionnel." };

  const payload = await getSessionPayload();
  const userAgent = (await headers()).get("user-agent")?.slice(0, 300) ?? null;
  const session = await prisma.session.create({
    data: {
      userId: target.id,
      impersonatorId: admin.id,
      assistanceReason: reason,
      returnSessionId: payload?.sid ?? null,
      expiresAt: new Date(Date.now() + ASSISTANCE_DURATION_MS),
      userAgent,
    },
  });

  // Inscrit au journal du cabinet assisté, au nom de celui qui assiste.
  await logAudit({
    userId: target.id,
    impersonatorId: admin.id,
    action: "ASSISTANCE_STARTED",
    entityType: "Session",
    entityId: session.id,
    metadata: { reason, expiresAt: session.expiresAt.toISOString() },
  });

  await createSession(target.id, session.id);
  redirect("/dashboard");
}

/**
 * Termine l'assistance et ramène à la super-administration.
 *
 * La session d'assistance est révoquée — le jeton ne rouvrira plus rien —
 * et la session de plateforme d'origine est rétablie si elle est toujours
 * valide ; sinon, il faut se reconnecter.
 */
export async function endAssistanceAction(): Promise<AssistanceResult> {
  const user = await getCurrentUser();
  if (!user?.assistance) return { ok: false, error: "Aucune assistance en cours." };

  const payload = await getSessionPayload();
  const session = payload?.sid ? await prisma.session.findUnique({ where: { id: payload.sid } }) : null;
  if (!session?.impersonatorId) return { ok: false, error: "Aucune assistance en cours." };

  await prisma.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
  await logAudit({
    userId: session.userId,
    impersonatorId: session.impersonatorId,
    action: "ASSISTANCE_ENDED",
    entityType: "Session",
    entityId: session.id,
    metadata: { reason: session.assistanceReason ?? "", durationMinutes: Math.round((Date.now() - session.createdAt.getTime()) / 60000) },
  });

  const returnSession = session.returnSessionId ? await prisma.session.findUnique({ where: { id: session.returnSessionId } }) : null;
  const canReturn = returnSession
    && returnSession.userId === session.impersonatorId
    && !returnSession.revokedAt
    && !returnSession.impersonatorId
    && returnSession.expiresAt.getTime() > Date.now();

  if (canReturn) {
    await createSession(returnSession.userId, returnSession.id);
    redirect("/plateforme");
  }
  await deleteSession();
  redirect("/login");
}
