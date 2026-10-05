"use server";

import { loginFailedMetadata } from "@/lib/audit-metadata";
import { rateLimitKey } from "@/lib/privacy";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { findActiveUserByEmail, verifyPassword } from "@/lib/auth/credentials";
import { createPendingTwoFactorSession } from "@/lib/auth/session";
import { closeCurrentSession, openSession } from "@/lib/auth/session-store";
import { generateNumericCode, hashToken } from "@/lib/auth/tokens";
import { logAudit } from "@/lib/audit";
import { organizationBlocked } from "@/lib/organization-access";
import { suspendedAccountMessage } from "@/lib/organization-status";
import { isRateLimited, recordAttempt } from "@/lib/rate-limit";
import { getEmailProvider } from "@/lib/email/provider";
import { twoFactorCodeTemplate } from "@/lib/email/templates";
import { getCurrentUser } from "@/lib/auth/dal";

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
  // Adresse et IP en empreinte (privacy.ts) : la limite tient, sans les garder en clair.
  const emailKey = rateLimitKey("login", email);
  const ipKey = rateLimitKey("login:ip", ip ?? "");
  if (await isRateLimited(emailKey, loginMaxAttempts, loginWindowMs) || await isRateLimited(ipKey, loginMaxAttempts * 3, loginWindowMs)) {
    return { error: "Trop de tentatives. Merci de réessayer dans quelques minutes." };
  }
  await recordAttempt(emailKey);
  await recordAttempt(ipKey);

  const user = await findActiveUserByEmail(email);
  const valid = user?.active ? await verifyPassword(user.passwordHash, password) : false;

  if (!user || !valid) {
    await logAudit({ userId: user?.id, action: "LOGIN_FAILED", metadata: loginFailedMetadata(email) });
    return { error: "Email ou mot de passe incorrect." };
  }

  // Espace suspendu : dit seulement après un mot de passe correct, pour ne
  // rien révéler à qui essaie des adresses.
  if (await organizationBlocked(user.organizationId)) {
    return { error: suspendedAccountMessage(process.env.SUPPORT_EMAIL) };
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

  await openSession(user.id);
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await logAudit({ userId: user.id, action: "LOGIN_SUCCEEDED" });
  redirect("/dashboard");
}

export async function logout() {
  // Pendant une assistance, « se déconnecter » la termine : elle doit donc
  // être journalisée comme telle, et la session de plateforme d'origine
  // reste intacte (elle n'est simplement pas rouverte).
  const assisting = (await getCurrentUser())?.assistance;
  const payload = await closeCurrentSession();
  if (payload) {
    await logAudit({
      userId: payload.userId,
      action: assisting ? "ASSISTANCE_ENDED" : "LOGOUT",
      ...(assisting ? { impersonatorId: assisting.impersonatorId, metadata: { reason: assisting.reason, endedBy: "déconnexion" } } : {}),
    });
  }
  redirect("/login");
}
