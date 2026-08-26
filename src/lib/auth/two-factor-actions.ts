"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { createSession, deletePendingTwoFactorSession, getPendingTwoFactorSession, createPendingTwoFactorSession } from "@/lib/auth/session";
import { generateNumericCode, hashToken } from "@/lib/auth/tokens";
import { logAudit } from "@/lib/audit";
import { getEmailProvider } from "@/lib/email/provider";
import { twoFactorCodeTemplate } from "@/lib/email/templates";

export type TwoFactorState = { error?: string } | undefined;

const maxAttempts = 5;
const codeDurationMs = 10 * 60 * 1000;

export async function verifyTwoFactorCode(_prevState: TwoFactorState, formData: FormData): Promise<TwoFactorState> {
  const code = String(formData.get("code") ?? "").trim();
  const pending = await getPendingTwoFactorSession();

  if (!pending) {
    return { error: "Votre session de connexion a expiré. Merci de vous reconnecter." };
  }

  if (!code) {
    return { error: "Merci de saisir le code reçu par email." };
  }

  const twoFactorCode = await prisma.twoFactorCode.findFirst({
    where: { userId: pending.userId, usedAt: null },
    orderBy: { createdAt: "desc" },
  });

  if (!twoFactorCode || twoFactorCode.expiresAt < new Date()) {
    return { error: "Ce code a expiré. Demandez-en un nouveau." };
  }

  if (twoFactorCode.attempts >= maxAttempts) {
    await logAudit({ userId: pending.userId, action: "TWO_FACTOR_FAILED", metadata: { reason: "max_attempts" } });
    return { error: "Trop de tentatives incorrectes. Demandez un nouveau code." };
  }

  if (twoFactorCode.codeHash !== hashToken(code)) {
    await prisma.twoFactorCode.update({ where: { id: twoFactorCode.id }, data: { attempts: { increment: 1 } } });
    await logAudit({ userId: pending.userId, action: "TWO_FACTOR_FAILED", metadata: { reason: "invalid_code" } });
    return { error: "Code incorrect." };
  }

  await prisma.twoFactorCode.update({ where: { id: twoFactorCode.id }, data: { usedAt: new Date() } });
  await deletePendingTwoFactorSession();
  await createSession(pending.userId);
  await prisma.user.update({ where: { id: pending.userId }, data: { lastLoginAt: new Date() } });
  await logAudit({ userId: pending.userId, action: "TWO_FACTOR_VERIFIED" });
  await logAudit({ userId: pending.userId, action: "LOGIN_SUCCEEDED" });

  redirect("/dashboard");
}

export async function resendTwoFactorCode() {
  const pending = await getPendingTwoFactorSession();
  if (!pending) redirect("/login");

  const user = await prisma.user.findUnique({ where: { id: pending.userId } });
  if (!user) redirect("/login");

  const code = generateNumericCode();
  await prisma.twoFactorCode.create({
    data: { userId: user.id, codeHash: hashToken(code), expiresAt: new Date(Date.now() + codeDurationMs) },
  });
  await createPendingTwoFactorSession(user.id);
  await getEmailProvider().send({ to: user.email, ...twoFactorCodeTemplate(code) });
  await logAudit({ userId: user.id, action: "TWO_FACTOR_CODE_SENT" });
}
