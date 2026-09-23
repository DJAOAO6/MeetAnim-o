"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { platformAccess } from "@/lib/platform/access";
import { MODULES, normalizeModules } from "@/lib/modules";

export type SetModulesResult = { ok: true; modules: string[] } | { ok: false; error: string };

/**
 * Les modules ouverts à un espace : décidés ici, par la super-administration,
 * et nulle part ailleurs. Ce qui est retiré se ferme à la requête suivante ;
 * les données restent en place.
 *
 * Inscrit au journal de l'espace concerné — il doit pouvoir savoir quand, et
 * par qui, ce qu'il voit a changé.
 */
export async function setOrganizationModulesAction(organizationId: string, requested: string[]): Promise<SetModulesResult> {
  const access = await platformAccess();
  if (!access.ok) return { ok: false, error: "Accès réservé à la super-administration, double authentification activée." };

  const organization = await prisma.organization.findUnique({ where: { id: organizationId }, select: { id: true, modules: true } });
  if (!organization) return { ok: false, error: "Cet espace n’existe plus." };

  const modules = normalizeModules(requested);
  const before = normalizeModules(organization.modules);
  await prisma.organization.update({ where: { id: organizationId }, data: { modules } });

  const opened = modules.filter((key) => !before.includes(key)).map((key) => MODULES[key].label);
  const closed = before.filter((key) => !modules.includes(key)).map((key) => MODULES[key].label);
  if (opened.length || closed.length) {
    await logAudit({
      userId: access.user.id,
      impersonatorId: null,
      organizationId,
      action: "MODULES_CHANGED",
      entityType: "Organization",
      entityId: organizationId,
      metadata: { opened, closed },
    });
  }

  revalidatePath("/plateforme");
  return { ok: true, modules };
}
