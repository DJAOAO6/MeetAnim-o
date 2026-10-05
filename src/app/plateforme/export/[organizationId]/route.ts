import { logAudit } from "@/lib/audit";
import { platformAccess } from "@/lib/platform/access";
import { exportFileNameFor, organizationExportStream } from "@/lib/platform/organization-export";

/**
 * Export complet d'un espace (C9, D10), réservé à la super-administration.
 * Le ZIP est produit à la demande et envoyé en flux : rien n'est conservé.
 */
export async function GET(_request: Request, context: { params: Promise<{ organizationId: string }> }) {
  const access = await platformAccess();
  // Sans l'accès, l'adresse n'existe pas : comme /plateforme.
  if (!access.ok) return new Response("Not found", { status: 404 });

  const { organizationId } = await context.params;
  const fileName = await exportFileNameFor(organizationId);
  if (!fileName) return new Response("Not found", { status: 404 });

  // Au journal de l'espace : qu'un export a eu lieu, pas son contenu.
  await logAudit({ userId: access.user.id, impersonatorId: null, organizationId, action: "ORGANIZATION_EXPORTED", entityType: "Organization", entityId: organizationId });

  return new Response(organizationExportStream(organizationId), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
