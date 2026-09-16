"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { hasPermission } from "@/lib/auth/permissions";
import { DEFAULT_PUBLIC_PAGE, normalizePublicPage, type PublicPageConfig } from "@/data/public-page";

export type PublicPageState = {
  draft: PublicPageConfig;
  published: PublicPageConfig | null;
  publishedAt: string | null;
  /** Vrai quand le brouillon diffère de ce que voient les visiteurs. */
  hasUnpublishedChanges: boolean;
};

function sameConfig(a: PublicPageConfig, b: PublicPageConfig | null): boolean {
  return b !== null && JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Brouillon et version publiée de la page. Le brouillon part de la version
 * publiée quand il n'existe pas encore : ouvrir l'éditeur ne doit jamais
 * afficher autre chose que la page réellement en ligne.
 */
export async function getPublicPageState(): Promise<PublicPageState> {
  const profile = await prisma.businessProfile.findFirst({
    select: { publicPageDraft: true, publicPagePublished: true, publicPagePublishedAt: true },
  });

  const published = profile?.publicPagePublished ? normalizePublicPage(profile.publicPagePublished) : null;
  const draft = profile?.publicPageDraft
    ? normalizePublicPage(profile.publicPageDraft)
    : published ?? DEFAULT_PUBLIC_PAGE;

  return {
    draft,
    published,
    publishedAt: profile?.publicPagePublishedAt?.toISOString() ?? null,
    hasUnpublishedChanges: !sameConfig(draft, published),
  };
}

/**
 * Configuration appliquée par la page publique. Rien de publié = page
 * d'origine : un professionnel qui n'a jamais ouvert l'éditeur garde
 * exactement la page qu'il avait.
 */
export async function getPublishedPublicPage(): Promise<PublicPageConfig> {
  const profile = await prisma.businessProfile.findFirst({ select: { publicPagePublished: true } });
  return profile?.publicPagePublished ? normalizePublicPage(profile.publicPagePublished) : DEFAULT_PUBLIC_PAGE;
}

export type PublicPageActionResult = { ok: true; state: PublicPageState } | { ok: false; error: string };

async function requireEditor(): Promise<{ ok: true; profileId: string } | { ok: false; error: string }> {
  const user = await requireUser();
  if (!hasPermission(user, "MANAGE_PUBLIC_SETTINGS")) {
    return { ok: false, error: "Vous n'avez pas la permission de modifier la page publique." };
  }
  const profile = await prisma.businessProfile.findFirst({ select: { id: true } });
  if (!profile) return { ok: false, error: "Aucun profil professionnel n'est encore configuré." };
  return { ok: true, profileId: profile.id };
}

/** Enregistre le brouillon. Sans effet sur ce que voient les visiteurs. */
export async function savePublicPageDraftAction(config: PublicPageConfig): Promise<PublicPageActionResult> {
  const access = await requireEditor();
  if (!access.ok) return access;

  try {
    await prisma.businessProfile.update({
      where: { id: access.profileId },
      data: { publicPageDraft: normalizePublicPage(config) },
    });
  } catch (error) {
    console.error("[page publique] Échec de l'enregistrement du brouillon", error);
    return { ok: false, error: "Le brouillon n'a pas pu être enregistré. Réessayez dans un instant." };
  }

  return { ok: true, state: await getPublicPageState() };
}

/**
 * Publie le brouillon. C'est le seul moment où la page vue par les clients
 * change ; la page publique est revalidée dans la foulée.
 */
export async function publishPublicPageAction(config: PublicPageConfig): Promise<PublicPageActionResult> {
  const access = await requireEditor();
  if (!access.ok) return access;

  const normalized = normalizePublicPage(config);
  try {
    await prisma.businessProfile.update({
      where: { id: access.profileId },
      data: { publicPageDraft: normalized, publicPagePublished: normalized, publicPagePublishedAt: new Date() },
    });
  } catch (error) {
    console.error("[page publique] Échec de la publication", error);
    return { ok: false, error: "La page n'a pas pu être publiée. Réessayez dans un instant." };
  }

  revalidatePath("/reserver/[slug]", "page");
  return { ok: true, state: await getPublicPageState() };
}

/** Ramène le brouillon à la version publiée, ou à la page d'origine. */
export async function discardPublicPageDraftAction(): Promise<PublicPageActionResult> {
  const access = await requireEditor();
  if (!access.ok) return access;

  try {
    // Prisma.DbNull, pas null : on efface la valeur en base plutôt que de
    // demander à ne rien changer.
    await prisma.businessProfile.update({
      where: { id: access.profileId },
      data: { publicPageDraft: Prisma.DbNull },
    });
  } catch (error) {
    console.error("[page publique] Échec de l'abandon du brouillon", error);
    return { ok: false, error: "Les modifications n'ont pas pu être annulées. Réessayez dans un instant." };
  }

  return { ok: true, state: await getPublicPageState() };
}

/**
 * Rétablit la présentation d'origine : brouillon et version publiée sont
 * effacés, la page publique revient exactement à ce qu'elle était avant toute
 * personnalisation. C'est le filet de sécurité de l'éditeur — on peut tout
 * essayer sans craindre de ne pas savoir revenir en arrière.
 *
 * Contrairement à l'abandon du brouillon, cette action change ce que voient
 * les clients : la page publique est donc revalidée.
 */
export async function resetPublicPageAction(): Promise<PublicPageActionResult> {
  const access = await requireEditor();
  if (!access.ok) return access;

  try {
    await prisma.businessProfile.update({
      where: { id: access.profileId },
      data: { publicPageDraft: Prisma.DbNull, publicPagePublished: Prisma.DbNull, publicPagePublishedAt: null },
    });
  } catch (error) {
    console.error("[page publique] Échec du rétablissement de la page d'origine", error);
    return { ok: false, error: "La page n'a pas pu être rétablie. Réessayez dans un instant." };
  }

  revalidatePath("/reserver/[slug]", "page");
  return { ok: true, state: await getPublicPageState() };
}
