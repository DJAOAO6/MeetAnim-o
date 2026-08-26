"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { findActiveUserByEmail, verifyPassword } from "@/lib/auth/credentials";
import { createPendingTwoFactorSession, createSession, deleteSession, getSessionPayload } from "@/lib/auth/session";
import { generateNumericCode, hashToken } from "@/lib/auth/tokens";
import { logAudit } from "@/lib/audit";
import { isRateLimited, recordAttempt } from "@/lib/rate-limit";
import { getEmailProvider } from "@/lib/email/provider";
import { twoFactorCodeTemplate } from "@/lib/email/templates";

export type LoginState = { error?: string } | undefined;

const loginMaxAttempts = 10;
const loginWindowMs = 15 * 60 * 1000;
const twoFactorCodeDurationMs = 10 * 60 * 1000;

async function requestIp() {
  const headerList = await headers();
  return headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

export async function login(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Merci de renseigner votre email et votre mot de passe." };
  }

  const ip = await requestIp();
  if (await isRateLimited(`login:${email}`, loginMaxAttempts, loginWindowMs) || await isRateLimited(`login:ip:${ip}`, loginMaxAttempts * 3, loginWindowMs)) {
    return { error: "Trop de tentatives. Merci de réessayer dans quelques minutes." };
  }
  await recordAttempt(`login:${email}`);
  await recordAttempt(`login:ip:${ip}`);

  const user = await findActiveUserByEmail(email);
  const valid = user?.active ? await verifyPassword(user.passwordHash, password) : false;

  if (!user || !valid) {
    await logAudit({ userId: user?.id, action: "LOGIN_FAILED", metadata: { email } });
    return { error: "Email ou mot de passe incorrect." };
  }

  if (user.twoFactorEnabled) {
    const code = generateNumericCode();
    await prisma.twoFactorCode.create({
      data: {
        userId: user.id,
        codeHash: hashToken(code),
        expiresAt: new Date(Date.now() + twoFactorCodeDurationMs),
      },
    });
    await createPendingTwoFactorSession(user.id);

    try {
      await getEmailProvider().send({ to: user.email, ...twoFactorCodeTemplate(code) });
    } catch {
      return { error: "L'envoi du code de connexion a échoué. Réessayez dans un instant." };
    }

    await logAudit({ userId: user.id, action: "TWO_FACTOR_CODE_SENT" });
    redirect("/login/verification");
  }

  await createSession(user.id);
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await logAudit({ userId: user.id, action: "LOGIN_SUCCEEDED" });
  redirect("/dashboard");
}

export async function logout() {
  const payload = await getSessionPayload();
  await deleteSession();
  if (payload) await logAudit({ userId: payload.userId, action: "LOGOUT" });
  redirect("/login");
}
