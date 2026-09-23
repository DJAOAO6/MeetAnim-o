"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/dal";
import { hasPermission } from "@/lib/auth/permissions";
import { logAudit } from "@/lib/audit";
import { getAvailability } from "@/lib/business-profile-actions";
import { currentDb, markCurrentOrganizationOnboarded } from "@/lib/organization";
import { hasCabinet } from "@/lib/practice-mode";
import { slugProblem } from "@/lib/slug";

export type CompleteOnboardingResult = { ok: true; slug: string } | { ok: false; error: string };

/**
 * Dernière étape de l'onboarding : le lien de réservation est choisi, et la
 * page s'ouvre au public.
 *
 * Pas avant d'avoir de quoi réserver : au moins une journée ouverte, au
 * moins une prestation active, et une adresse de cabinet quand on y reçoit.
 * Chaque manque est dit tel quel, pour que le professionnel sache quelle
 * étape reprendre.
 */
export async function completeOnboardingAction(rawSlug: string): Promise<CompleteOnboardingResult> {
  const user = await requireUser();
  if (!hasPermission(user, "MANAGE_PUBLIC_SETTINGS")) {
    return { ok: false, error: "Seul un administrateur de l’espace peut ouvrir la page de réservation." };
  }
  const db = await currentDb();

  const slug = rawSlug.trim();
  const problem = slugProblem(slug);
  if (problem) return { ok: false, error: problem };

  const profile = await db.businessProfile.findFirst();
  if (!profile) return { ok: false, error: "Le profil de l’espace est introuvable." };

  if (hasCabinet(profile.practiceMode) && !profile.address.trim()) {
    return { ok: false, error: "Indiquez l’adresse du cabinet (étape « Votre façon d’exercer »)." };
  }
  const availability = await getAvailability(db);
  if (!availability.days.some((day) => day.enabled && day.slots.length > 0)) {
    return { ok: false, error: "Ouvrez au moins une journée (étape « Vos horaires »)." };
  }
  if ((await db.service.count({ where: { active: true } })) === 0) {
    return { ok: false, error: "Ajoutez au moins une prestation (étape « Vos prestations »)." };
  }

  if (slug !== profile.slug) {
    try {
      await db.businessProfile.update({ where: { id: profile.id }, data: { slug } });
    } catch (error) {
      if (error instanceof Error && error.message.includes("Unique constraint")) {
        return { ok: false, error: "Ce lien est déjà utilisé par un autre professionnel." };
      }
      throw error;
    }
  }

  await markCurrentOrganizationOnboarded();
  await logAudit({ userId: user.id, action: "ONBOARDING_COMPLETED", entityType: "BusinessProfile", entityId: profile.id, metadata: { slug } });

  revalidatePath("/dashboard", "layout");
  revalidatePath(`/reserver/${slug}`);
  return { ok: true, slug };
}
