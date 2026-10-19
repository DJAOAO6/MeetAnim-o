"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { deletePendingTwoFactorSession, getPendingTwoFactorSession } from "@/lib/auth/session";
import { openSession } from "@/lib/auth/session-store";
import { generateNumericCode, hashToken } from "@/lib/auth/tokens";
import { logAudit } from "@/lib/audit";
import { organizationBlocked } from "@/lib/organization-access";
import { suspendedAccountMessage } from "@/lib/organization-status";
import { getEmailProvider } from "@/lib/email/provider";
import { twoFactorCodeTemplate } from "@/lib/email/templates";
import { consumeAttempt } from "@/lib/rate-limit";
import { rateLimitKey } from "@/lib/privacy";

export type TwoFactorState = { error?: string } | undefined;
export type ResendTwoFactorResult = { ok: true } | { ok: false; error: string };

const maxAttempts = 5;
const codeDurationMs = 10 * 60 * 1000;

// Plafonds par compte, tous codes confondus (audit 2026-10, SEC-01) : sans
// eux, « cinq essais, nouveau code » recommençait sans fin. Dix essais par
// quart d'heure sur un million de codes possibles : deviner devient vain.
const verifyMaxPerWindow = 10;
const resendMaxPerWindow = 3;
const accountWindowMs = 15 * 60 * 1000;

export async function verifyTwoFactorCode(_prevState: TwoFactorState, formData: FormData): Promise<TwoFactorState> {
  const code = String(formData.get("code") ?? "").trim();
  const pending = await getPendingTwoFactorSession();

  if (!pending) {
    return { error: "Votre session de connexion a expiré. Merci de vous reconnecter." };
  }

  if (!code) {
    return { error: "Merci de saisir le code reçu par email." };
  }

  if (!(await consumeAttempt(rateLimitKey("2fa-verify", pending.userId), verifyMaxPerWindow, accountWindowMs))) {
    await logAudit({ userId: pending.userId, action: "TWO_FACTOR_FAILED", metadata: { reason: "account_limit" } });
    return { error: "Trop de tentatives. Réessayez dans un quart d’heure." };
  }

  const twoFactorCode = await prisma.twoFactorCode.findFirst({
    where: { userId: pending.userId, usedAt: null },
    orderBy: { createdAt: "desc" },
  });

  if (!twoFactorCode || twoFactorCode.expiresAt < new Date()) {
    return { error: "Ce code a expiré. Demandez-en un nouveau." };
  }

  // L'essai est compté AVANT d'être jugé, par une écriture conditionnelle :
  // des requêtes simultanées ne peuvent plus toutes passer le contrôle sur
  // un compteur lu avant d'avoir bougé (audit 2026-10, phase 3 : 12 essais
  // examinés pour 5 permis).
  const counted = await prisma.twoFactorCode.updateMany({
    where: { id: twoFactorCode.id, usedAt: null, attempts: { lt: maxAttempts } },
    data: { attempts: { increment: 1 } },
  });
  if (counted.count === 0) {
    await logAudit({ userId: pending.userId, action: "TWO_FACTOR_FAILED", metadata: { reason: "max_attempts" } });
    return { error: "Trop de tentatives incorrectes. Demandez un nouveau code." };
  }

  if (twoFactorCode.codeHash !== hashToken(code)) {
    await logAudit({ userId: pending.userId, action: "TWO_FACTOR_FAILED", metadata: { reason: "invalid_code" } });
    return { error: "Code incorrect." };
  }

  // Usage unique, même face à deux validations simultanées du bon code.
  const used = await prisma.twoFactorCode.updateMany({ where: { id: twoFactorCode.id, usedAt: null }, data: { usedAt: new Date() } });
  if (used.count === 0) {
    return { error: "Ce code a déjà servi. Demandez-en un nouveau." };
  }
  await deletePendingTwoFactorSession();
  // L'espace a pu être suspendu entre le mot de passe et le code.
  const account = await prisma.user.findUnique({ where: { id: pending.userId }, select: { organizationId: true } });
  if (await organizationBlocked(account?.organizationId ?? null)) {
    return { error: suspendedAccountMessage(process.env.SUPPORT_EMAIL) };
  }
  await openSession(pending.userId);
  await prisma.user.update({ where: { id: pending.userId }, data: { lastLoginAt: new Date() } });
  await logAudit({ userId: pending.userId, action: "TWO_FACTOR_VERIFIED" });
  await logAudit({ userId: pending.userId, action: "LOGIN_SUCCEEDED" });

  redirect("/dashboard");
}

/**
 * Nouveau code. Limité par compte, et sans prolonger l'attente : la fenêtre
 * ouverte par le mot de passe se referme à l'heure prévue, quel que soit le
 * nombre de renvois (audit 2026-10, SEC-01).
 */
export async function resendTwoFactorCode(): Promise<ResendTwoFactorResult> {
  const pending = await getPendingTwoFactorSession();
  if (!pending) redirect("/login");

  const user = await prisma.user.findUnique({ where: { id: pending.userId } });
  if (!user) redirect("/login");

  if (!(await consumeAttempt(rateLimitKey("2fa-resend", user.id), resendMaxPerWindow, accountWindowMs))) {
    return { ok: false, error: "Trop de codes demandés. Réessayez dans un quart d’heure." };
  }

  // Un seul code valable à la fois : les précédents ne servent plus.
  await prisma.twoFactorCode.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } });
  const code = generateNumericCode();
  await prisma.twoFactorCode.create({
    data: { userId: user.id, codeHash: hashToken(code), expiresAt: new Date(Date.now() + codeDurationMs) },
  });
  await getEmailProvider().send({ to: user.email, ...twoFactorCodeTemplate(code) });
  await logAudit({ userId: user.id, action: "TWO_FACTOR_CODE_SENT" });
  return { ok: true };
}
