"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/dal";
import { hashPassword } from "@/lib/auth/credentials";
import { generateResetToken, hashToken } from "@/lib/auth/tokens";
import { logAudit } from "@/lib/audit";
import { getEmailProvider } from "@/lib/email/provider";
import { passwordResetTemplate } from "@/lib/email/templates";
import { permissionKeys, type PermissionKey } from "@/lib/auth/permissions";
import type { UserRole } from "@/generated/prisma/client";
import { currentOrganizationId } from "@/lib/organization";

export type CreateUserState = { error?: string; resetUrl?: string } | undefined;

const inviteTokenDurationMs = 24 * 60 * 60 * 1000;

/**
 * Pendant une assistance, la plateforme aide le cabinet dans son travail ;
 * elle ne décide pas de qui peut y accéder. Créer, supprimer ou modifier un
 * compte de l'équipe — rôle, droits, adresse, double authentification —
 * reste donc la décision du cabinet lui-même. Sans cette règle, changer
 * l'adresse d'un compte puis demander un nouveau mot de passe suffirait à en
 * prendre le contrôle.
 */
const ASSISTANCE_REFUSAL = "Pendant une assistance, les comptes de l'équipe ne se modifient pas : c'est au cabinet d'en décider.";

function refuseDuringAssistance(admin: { assistance: unknown }): void {
  if (admin.assistance) throw new Error(ASSISTANCE_REFUSAL);
}

/**
 * Le compte visé, s'il fait bien partie de l'équipe de l'administrateur.
 *
 * Un administrateur ne gère que les comptes de son propre espace : un
 * identifiant venu d'ailleurs — requête forgée, lien recopié — est refusé
 * comme s'il n'existait pas. Un compte de super-administration n'est modifié
 * par personne d'autre que lui-même : sinon changer son adresse puis
 * demander un nouveau mot de passe suffirait à s'emparer de l'accès à tous
 * les espaces.
 */
async function teamMember(admin: { id: string; organizationId: string | null }, userId: string): Promise<{ ok: true; target: { id: string; email: string; role: UserRole; organizationId: string } } | { ok: false; error: string }> {
  const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, role: true, organizationId: true, platformAdmin: true } });
  if (!target || !admin.organizationId || target.organizationId !== admin.organizationId) return { ok: false, error: "Compte introuvable." };
  if (target.platformAdmin && target.id !== admin.id) return { ok: false, error: "Ce compte ne peut être modifié que par son titulaire." };
  return { ok: true, target: { id: target.id, email: target.email, role: target.role, organizationId: target.organizationId } };
}

/** Pour les actions sans valeur de retour : un refus devient une erreur. */
async function requireTeamMember(admin: { id: string; organizationId: string | null }, userId: string) {
  const member = await teamMember(admin, userId);
  if (!member.ok) throw new Error(member.error);
  return member.target;
}

export async function createUser(_prevState: CreateUserState, formData: FormData): Promise<CreateUserState> {
  const admin = await requireAdmin();
  if (admin.assistance) return { error: ASSISTANCE_REFUSAL };

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

  // Le nouveau compte rejoint l'espace professionnel de celui qui l'invite :
  // un cabinet n'ajoute des collègues que chez lui.
  const user = await prisma.user.create({
    data: { email, firstName, lastName, role, passwordHash, organizationId: await currentOrganizationId() },
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
  refuseDuringAssistance(admin);
  await requireTeamMember(admin, userId);
  await prisma.user.update({ where: { id: userId }, data: { role } });
  await logAudit({ userId: admin.id, action: "USER_UPDATED", entityType: "User", entityId: userId, metadata: { role } });
  revalidatePath("/dashboard/admin");
}

export async function setUserActive(userId: string, active: boolean) {
  const admin = await requireAdmin();
  refuseDuringAssistance(admin);
  await requireTeamMember(admin, userId);
  await prisma.user.update({ where: { id: userId }, data: { active } });
  await logAudit({ userId: admin.id, action: active ? "USER_UPDATED" : "USER_DEACTIVATED", entityType: "User", entityId: userId, metadata: { active } });
  revalidatePath("/dashboard/admin");
}

export async function setUserTwoFactor(userId: string, enabled: boolean) {
  const admin = await requireAdmin();
  refuseDuringAssistance(admin);
  await requireTeamMember(admin, userId);
  await prisma.user.update({ where: { id: userId }, data: { twoFactorEnabled: enabled } });
  await logAudit({ userId: admin.id, action: "USER_UPDATED", entityType: "User", entityId: userId, metadata: { twoFactorEnabled: enabled } });
  revalidatePath("/dashboard/admin");
}

export type UpdateUserProfileResult = { ok: true } | { ok: false; error: string };

export async function updateUserProfileAction(userId: string, input: { firstName: string; lastName: string; email: string }): Promise<UpdateUserProfileResult> {
  const admin = await requireAdmin();
  if (admin.assistance) return { ok: false, error: ASSISTANCE_REFUSAL };

  const member = await teamMember(admin, userId);
  if (!member.ok) return member;

  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const email = input.email.trim().toLowerCase();

  if (!firstName || !lastName || !email) {
    return { ok: false, error: "Merci de renseigner le prénom, le nom et l'email." };
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing && existing.id !== userId) {
    return { ok: false, error: "Un autre compte utilise déjà cet email." };
  }

  await prisma.user.update({ where: { id: userId }, data: { firstName, lastName, email } });
  await logAudit({ userId: admin.id, action: "USER_UPDATED", entityType: "User", entityId: userId, metadata: { firstName, lastName, email } });
  revalidatePath("/dashboard/admin");

  return { ok: true };
}

export type DeleteUserResult = { ok: true } | { ok: false; error: string };

export async function deleteUserAction(userId: string): Promise<DeleteUserResult> {
  const admin = await requireAdmin();
  if (admin.assistance) return { ok: false, error: ASSISTANCE_REFUSAL };

  if (userId === admin.id) {
    return { ok: false, error: "Vous ne pouvez pas supprimer votre propre compte." };
  }

  const member = await teamMember(admin, userId);
  if (!member.ok) return member;
  const { target } = member;

  if (target.role === "ADMIN") {
    // Le dernier administrateur de l'espace, pas de toute la plateforme.
    const otherAdmins = await prisma.user.count({ where: { role: "ADMIN", id: { not: userId }, organizationId: target.organizationId } });
    if (otherAdmins === 0) {
      return { ok: false, error: "Impossible de supprimer le dernier compte administrateur." };
    }
  }

  // Les comptes rendus sont rattachés à leur auteur en cascade : supprimer le
  // compte les effacerait tous, sans retour possible hors restauration de la
  // base. Ce sont des dossiers cliniques — ils appartiennent au cabinet, pas
  // à la personne qui les a tapés. On refuse donc, et on oriente vers la
  // désactivation, qui coupe l'accès sans rien perdre.
  const documentCount = await prisma.studioDocument.count({ where: { createdByUserId: userId } });
  if (documentCount > 0) {
    return {
      ok: false,
      error: `Ce compte a rédigé ${documentCount} compte${documentCount > 1 ? "s" : ""} rendu${documentCount > 1 ? "s" : ""}, qui ser${documentCount > 1 ? "aient" : "ait"} supprimé${documentCount > 1 ? "s" : ""} avec lui. Désactivez-le plutôt : il ne pourra plus se connecter, et ses documents restent au dossier.`,
    };
  }

  await prisma.user.delete({ where: { id: userId } });
  await logAudit({ userId: admin.id, action: "USER_UPDATED", entityType: "User", entityId: userId, metadata: { deleted: true, email: target.email } });
  revalidatePath("/dashboard/admin");

  return { ok: true };
}

export async function setUserPermissions(userId: string, permissions: PermissionKey[]) {
  const admin = await requireAdmin();
  refuseDuringAssistance(admin);
  await requireTeamMember(admin, userId);
  const validPermissions = permissions.filter((permission) => permissionKeys.includes(permission));
  await prisma.user.update({ where: { id: userId }, data: { permissions: validPermissions } });
  await logAudit({ userId: admin.id, action: "USER_UPDATED", entityType: "User", entityId: userId, metadata: { permissions: validPermissions } });
  revalidatePath("/dashboard/admin");
}
