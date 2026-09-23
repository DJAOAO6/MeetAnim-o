"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { logAudit } from "@/lib/audit";
import { hashPassword } from "@/lib/auth/credentials";
import { passwordSchema } from "@/lib/auth/password-policy";
import { openSession } from "@/lib/auth/session-store";
import { generateResetToken, hashToken } from "@/lib/auth/tokens";
import { blankAvailability, blankProfile } from "@/lib/blank-profile";
import { getEmailProvider } from "@/lib/email/provider";
import { invitationTemplate } from "@/lib/email/templates";
import { platformAccess } from "@/lib/platform/access";
import { findInvitation, INVITATION_DURATION_MS, INVITATION_VALIDITY_DAYS, invitationUrl } from "@/lib/platform/invitations";
import { firstFreeSlug } from "@/lib/slug";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NAME_MAX_LENGTH = 120;

export type CreateInvitationResult =
  | { ok: true; url: string; emailSent: boolean }
  | { ok: false; error: string };

/**
 * Invite un professionnel à ouvrir son cabinet.
 *
 * Une nouvelle invitation pour la même adresse annule les précédentes encore
 * valables : il n'existe jamais qu'un lien utilisable par personne. Le lien
 * est rendu une fois, ici, pour pouvoir être transmis autrement si l'e-mail
 * n'arrive pas — il n'est conservé nulle part en clair.
 */
export async function createInvitationAction(input: { email: string; organizationName: string }): Promise<CreateInvitationResult> {
  const access = await platformAccess();
  if (!access.ok) return { ok: false, error: "Accès réservé à la super-administration, double authentification activée." };

  const email = input.email.trim().toLowerCase();
  const organizationName = input.organizationName.trim();
  if (!EMAIL_PATTERN.test(email)) return { ok: false, error: "Adresse e-mail invalide." };
  if (!organizationName) return { ok: false, error: "Indiquez le nom de l’activité : l’invité pourra le modifier." };
  if (organizationName.length > NAME_MAX_LENGTH) return { ok: false, error: "Nom d’activité trop long." };

  const existingUser = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existingUser) return { ok: false, error: "Un compte existe déjà avec cette adresse." };

  const token = generateResetToken();
  const now = new Date();
  const invitation = await prisma.$transaction(async (tx) => {
    await tx.invitation.updateMany({
      where: { email, usedAt: null, revokedAt: null, expiresAt: { gt: now } },
      data: { revokedAt: now },
    });
    return tx.invitation.create({
      data: { email, organizationName, tokenHash: hashToken(token), expiresAt: new Date(now.getTime() + INVITATION_DURATION_MS), createdById: access.user.id },
    });
  });

  const url = invitationUrl(token);
  let emailSent = true;
  try {
    await getEmailProvider().send({ to: email, ...invitationTemplate({ url, organizationName, validityDays: INVITATION_VALIDITY_DAYS }) });
  } catch {
    emailSent = false;
  }

  await logAudit({
    userId: access.user.id,
    impersonatorId: null,
    action: "INVITATION_SENT",
    entityType: "Invitation",
    entityId: invitation.id,
    metadata: { email, organizationName, emailSent },
  });

  revalidatePath("/plateforme");
  return { ok: true, url, emailSent };
}

export type RevokeInvitationResult = { ok: true } | { ok: false; error: string };

export async function revokeInvitationAction(invitationId: string): Promise<RevokeInvitationResult> {
  const access = await platformAccess();
  if (!access.ok) return { ok: false, error: "Accès réservé à la super-administration, double authentification activée." };

  const { count } = await prisma.invitation.updateMany({
    where: { id: invitationId, usedAt: null, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (count === 0) return { ok: false, error: "Cette invitation n’est plus en attente." };

  await logAudit({ userId: access.user.id, impersonatorId: null, action: "INVITATION_REVOKED", entityType: "Invitation", entityId: invitationId });
  revalidatePath("/plateforme");
  return { ok: true };
}

export type AcceptInvitationState = { error: string } | undefined;

class AcceptRefused extends Error {}

/**
 * L'invité crée son compte : le cabinet, son profil — vierge, à son nom —,
 * des horaires de départ et son compte administrateur naissent ensemble, ou
 * pas du tout. L'adresse du compte est celle de l'invitation, jamais une
 * adresse saisie : c'est en la recevant que l'invité a prouvé qu'il la
 * détient.
 */
export async function acceptInvitationAction(_state: AcceptInvitationState, formData: FormData): Promise<AcceptInvitationState> {
  const token = String(formData.get("token") ?? "");
  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  const organizationName = String(formData.get("organizationName") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (!firstName || !lastName) return { error: "Indiquez votre prénom et votre nom." };
  if (!organizationName) return { error: "Indiquez le nom de votre activité." };
  if ([firstName, lastName, organizationName].some((value) => value.length > NAME_MAX_LENGTH)) return { error: "Un des champs est trop long." };
  if (password !== confirmPassword) return { error: "Les deux mots de passe ne correspondent pas." };
  const validation = passwordSchema.safeParse(password);
  if (!validation.success) return { error: validation.error.issues[0]?.message ?? "Mot de passe invalide." };

  const lookup = await findInvitation(token);
  if (!lookup.ok) return { error: "Cette invitation n’est plus valable. Demandez-en une nouvelle." };
  const { invitation } = lookup;

  const passwordHash = await hashPassword(password);

  let created: { userId: string; organizationId: string };
  try {
    created = await prisma.$transaction(async (tx) => {
      // L'invitation est prise d'abord, sous condition : deux envois
      // simultanés du formulaire n'ouvriront jamais deux cabinets.
      const now = new Date();
      const claimed = await tx.invitation.updateMany({
        where: { id: invitation.id, usedAt: null, revokedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (claimed.count !== 1) throw new AcceptRefused("Cette invitation n’est plus valable. Demandez-en une nouvelle.");

      if (await tx.user.findUnique({ where: { email: invitation.email }, select: { id: true } })) {
        throw new AcceptRefused("Un compte existe déjà avec cette adresse. Connectez-vous.");
      }

      const organization = await tx.organization.create({ data: { name: organizationName } });
      const slug = await firstFreeSlug(`${firstName} ${lastName}`, async (candidate) => Boolean(await tx.businessProfile.findUnique({ where: { slug: candidate }, select: { id: true } })));
      await tx.businessProfile.create({
        data: {
          ...blankProfile({ firstName, lastName, company: organizationName, email: invitation.email, slug }),
          availability: blankAvailability() as unknown as Prisma.InputJsonValue,
          organizationId: organization.id,
        },
      });
      const user = await tx.user.create({
        data: { email: invitation.email, passwordHash, firstName, lastName, role: "ADMIN", organizationId: organization.id },
      });
      await tx.invitation.update({ where: { id: invitation.id }, data: { organizationId: organization.id } });
      return { userId: user.id, organizationId: organization.id };
    });
  } catch (error) {
    if (error instanceof AcceptRefused) return { error: error.message };
    throw error;
  }

  await logAudit({
    userId: created.userId,
    impersonatorId: null,
    action: "ORGANIZATION_CREATED",
    entityType: "Organization",
    entityId: created.organizationId,
    metadata: { invitationId: invitation.id, organizationName },
  });

  await openSession(created.userId);
  redirect("/dashboard/bienvenue");
}
