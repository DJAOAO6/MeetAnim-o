"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/dal";
import { hashPassword } from "@/lib/auth/credentials";
import { generateResetToken, hashToken } from "@/lib/auth/tokens";
import { logAudit } from "@/lib/audit";
import { getEmailProvider } from "@/lib/email/provider";
import { passwordResetTemplate } from "@/lib/email/templates";
import type { UserRole } from "@/generated/prisma/client";

export type CreateUserState = { error?: string; resetUrl?: string } | undefined;

const inviteTokenDurationMs = 24 * 60 * 60 * 1000;

export async function createUser(_prevState: CreateUserState, formData: FormData): Promise<CreateUserState> {
  const admin = await requireAdmin();

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  const role = String(formData.get("role") ?? "PRACTITIONER") as UserRole;

  if (!email || !firstName || !lastName) {
    return { error: "Merci de renseigner l'email, le prénom et le nom." };
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return { error: "Un compte existe déjà avec cet email." };
  }

  // Mot de passe temporaire aléatoire : jamais communiqué tel quel, seul le
  // lien de définition de mot de passe (réutilise le flow "mot de passe
  // oublié") est transmis.
  const temporaryPassword = generateResetToken();
  const passwordHash = await hashPassword(temporaryPassword);

  const user = await prisma.user.create({
    data: { email, firstName, lastName, role, passwordHash },
  });

  const token = generateResetToken();
  await prisma.passwordResetToken.create({
    data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + inviteTokenDurationMs) },
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const resetUrl = `${appUrl}/reinitialiser-mot-de-passe?token=${token}`;

  try {
    await getEmailProvider().send({ to: user.email, ...passwordResetTemplate(resetUrl) });
  } catch {
    // Le lien reste affiché à l'admin ci-dessous même si l'envoi échoue.
  }

  await logAudit({ userId: admin.id, action: "USER_CREATED", entityType: "User", entityId: user.id });
  revalidatePath("/dashboard/admin");

  return { resetUrl };
}

export async function setUserRole(userId: string, role: UserRole) {
  const admin = await requireAdmin();
  await prisma.user.update({ where: { id: userId }, data: { role } });
  await logAudit({ userId: admin.id, action: "USER_UPDATED", entityType: "User", entityId: userId, metadata: { role } });
  revalidatePath("/dashboard/admin");
}

export async function setUserActive(userId: string, active: boolean) {
  const admin = await requireAdmin();
  await prisma.user.update({ where: { id: userId }, data: { active } });
  await logAudit({ userId: admin.id, action: active ? "USER_UPDATED" : "USER_DEACTIVATED", entityType: "User", entityId: userId, metadata: { active } });
  revalidatePath("/dashboard/admin");
}

export async function setUserTwoFactor(userId: string, enabled: boolean) {
  const admin = await requireAdmin();
  await prisma.user.update({ where: { id: userId }, data: { twoFactorEnabled: enabled } });
  await logAudit({ userId: admin.id, action: "USER_UPDATED", entityType: "User", entityId: userId, metadata: { twoFactorEnabled: enabled } });
  revalidatePath("/dashboard/admin");
}
