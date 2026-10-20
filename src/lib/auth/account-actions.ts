"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { getSessionPayload } from "@/lib/auth/session";
import { openSession } from "@/lib/auth/session-store";
import { hashPassword, verifyPassword } from "@/lib/auth/credentials";
import { passwordSchema } from "@/lib/auth/password-policy";
import { logAudit } from "@/lib/audit";
import { consumeAttempt } from "@/lib/rate-limit";
import { rateLimitKey } from "@/lib/privacy";

/**
 * « Mon compte » (audit 2026-10, FONC-03, SEC-04, SEC-07) : chacun gère ses
 * propres accès, sans passer par l'administrateur ni par « mot de passe
 * oublié ». Jamais pendant une assistance : la plateforme n'a pas à changer
 * le mot de passe ni la double authentification de quelqu'un.
 */

export type AccountSession = { id: string; createdAt: string; userAgent: string | null; current: boolean };
export type AccountOverview = { email: string; twoFactorEnabled: boolean; platformAdmin: boolean; sessions: AccountSession[] };
export type AccountResult = { ok: true; message: string } | { ok: false; error: string };

const ASSISTANCE_REFUSAL = "Pendant une assistance, ces réglages restent à la main du titulaire du compte.";
const ACCOUNT_ATTEMPTS = 5;
const ACCOUNT_WINDOW_MS = 15 * 60 * 1000;

/** Chaque essai de mot de passe compte, pour qu'une session volée ne serve pas à le deviner. */
async function passwordMatches(userId: string, password: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await consumeAttempt(rateLimitKey("account:password", userId), ACCOUNT_ATTEMPTS, ACCOUNT_WINDOW_MS))) {
    return { ok: false, error: "Trop d’essais. Réessayez dans un quart d’heure." };
  }
  const account = await prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
  if (!account || !(await verifyPassword(account.passwordHash, password))) return { ok: false, error: "Mot de passe actuel incorrect." };
  return { ok: true };
}

export async function getAccountOverview(): Promise<AccountOverview> {
  const user = await requireUser({ allowUnverified: true });
  const payload = await getSessionPayload();
  const sessions = await prisma.session.findMany({
    where: { userId: user.id, revokedAt: null, impersonatorId: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    select: { id: true, createdAt: true, userAgent: true },
  });
  return {
    email: user.email,
    twoFactorEnabled: user.twoFactorEnabled,
    platformAdmin: user.platformAdmin,
    sessions: sessions.map((session) => ({ id: session.id, createdAt: session.createdAt.toISOString(), userAgent: session.userAgent, current: session.id === payload?.sid })),
  };
}

export async function changePasswordAction(_state: AccountResult | undefined, formData: FormData): Promise<AccountResult> {
  const user = await requireUser({ allowUnverified: true });
  if (user.assistance) return { ok: false, error: ASSISTANCE_REFUSAL };

  const current = String(formData.get("currentPassword") ?? "");
  const next = String(formData.get("newPassword") ?? "");
  const confirmation = String(formData.get("confirmPassword") ?? "");
  if (next !== confirmation) return { ok: false, error: "Les deux nouveaux mots de passe ne correspondent pas." };
  const validation = passwordSchema.safeParse(next);
  if (!validation.success) return { ok: false, error: validation.error.issues[0]?.message ?? "Mot de passe invalide." };
  const check = await passwordMatches(user.id, current);
  if (!check.ok) return check;

  // Toutes les sessions du compte tombent (un ancien appareil, ou quelqu'un
  // qui connaissait l'ancien mot de passe) ; celle-ci est rouverte aussitôt.
  const now = new Date();
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(next), passwordChangedAt: now } });
  await prisma.session.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: now } });
  await prisma.passwordResetToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: now } });
  await openSession(user.id);
  await logAudit({ userId: user.id, action: "USER_UPDATED", entityType: "User", entityId: user.id, metadata: { password: "changed" } });
  revalidatePath("/dashboard/compte");
  return { ok: true, message: "Mot de passe changé. Vos autres appareils ont été déconnectés." };
}

export async function setOwnTwoFactorAction(enabled: boolean, currentPassword: string): Promise<AccountResult> {
  const user = await requireUser({ allowUnverified: true });
  if (user.assistance) return { ok: false, error: ASSISTANCE_REFUSAL };
  // Un compte de plateforme ouvre tous les espaces : la double
  // authentification lui est imposée (platform/access.ts).
  if (!enabled && user.platformAdmin) return { ok: false, error: "Un compte de super-administration garde la double authentification." };
  const check = await passwordMatches(user.id, currentPassword);
  if (!check.ok) return check;

  await prisma.user.update({ where: { id: user.id }, data: { twoFactorEnabled: enabled } });
  await logAudit({ userId: user.id, action: "USER_UPDATED", entityType: "User", entityId: user.id, metadata: { twoFactorEnabled: enabled, self: true } });
  revalidatePath("/dashboard/compte");
  return { ok: true, message: enabled ? "Double authentification activée : un code vous sera demandé à chaque connexion." : "Double authentification désactivée." };
}

export async function revokeOtherSessionsAction(): Promise<AccountResult> {
  const user = await requireUser({ allowUnverified: true });
  if (user.assistance) return { ok: false, error: ASSISTANCE_REFUSAL };
  const payload = await getSessionPayload();
  const { count } = await prisma.session.updateMany({
    where: { userId: user.id, revokedAt: null, impersonatorId: null, ...(payload?.sid ? { id: { not: payload.sid } } : {}) },
    data: { revokedAt: new Date() },
  });
  await logAudit({ userId: user.id, action: "USER_UPDATED", entityType: "User", entityId: user.id, metadata: { sessionsRevoked: count } });
  revalidatePath("/dashboard/compte");
  return { ok: true, message: count > 0 ? `${count} autre${count > 1 ? "s" : ""} session${count > 1 ? "s" : ""} déconnectée${count > 1 ? "s" : ""}.` : "Aucune autre session ouverte." };
}
