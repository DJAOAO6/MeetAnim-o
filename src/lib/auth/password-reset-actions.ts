"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/credentials";
import { generateResetToken, hashToken } from "@/lib/auth/tokens";
import { passwordSchema } from "@/lib/auth/password-policy";
import { logAudit } from "@/lib/audit";
import { isRateLimited, recordAttempt } from "@/lib/rate-limit";
import { getEmailProvider } from "@/lib/email/provider";
import { passwordResetTemplate } from "@/lib/email/templates";

export type RequestResetState = { message: string } | { error: string } | undefined;
export type ResetPasswordState = { error?: string } | undefined;

const requestMaxAttempts = 5;
const requestWindowMs = 30 * 60 * 1000;
const tokenDurationMs = 30 * 60 * 1000;
const genericMessage = "Si un compte existe avec cette adresse, un email vient de vous être envoyé.";

export async function requestPasswordReset(_prevState: RequestResetState, formData: FormData): Promise<RequestResetState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) return { error: "Merci de renseigner votre email." };

  if (await isRateLimited(`reset:${email}`, requestMaxAttempts, requestWindowMs)) {
    // Réponse volontairement identique : ne jamais laisser deviner si l'email existe.
    return { message: genericMessage };
  }
  await recordAttempt(`reset:${email}`);

  const user = await prisma.user.findUnique({ where: { email } });

  if (user?.active) {
    const token = generateResetToken();
    await prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + tokenDurationMs) },
    });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const resetUrl = `${appUrl}/reinitialiser-mot-de-passe?token=${token}`;

    try {
      await getEmailProvider().send({ to: user.email, ...passwordResetTemplate(resetUrl) });
      await logAudit({ userId: user.id, action: "PASSWORD_RESET_REQUESTED" });
    } catch {
      // On ne révèle jamais l'échec technique côté client, pour ne pas divulguer d'information.
    }
  }

  return { message: genericMessage };
}

export async function resetPassword(_prevState: ResetPasswordState, formData: FormData): Promise<ResetPasswordState> {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (!token) return { error: "Lien de réinitialisation invalide." };
  if (password !== confirmPassword) return { error: "Les deux mots de passe ne correspondent pas." };

  const validation = passwordSchema.safeParse(password);
  if (!validation.success) return { error: validation.error.issues[0]?.message ?? "Mot de passe invalide." };

  const resetToken = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashToken(token) } });

  if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
    return { error: "Ce lien de réinitialisation est invalide ou a expiré." };
  }

  const passwordHash = await hashPassword(password);

  await prisma.$transaction([
    prisma.user.update({ where: { id: resetToken.userId }, data: { passwordHash, passwordChangedAt: new Date() } }),
    prisma.passwordResetToken.update({ where: { id: resetToken.id }, data: { usedAt: new Date() } }),
  ]);

  await logAudit({ userId: resetToken.userId, action: "PASSWORD_RESET_COMPLETED" });
  redirect("/login?reset=ok");
}
