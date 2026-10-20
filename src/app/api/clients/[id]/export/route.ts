import { getCurrentUser } from "@/lib/auth/dal";
import { currentDb } from "@/lib/organization";
import { buildClientExport } from "@/lib/client-export";
import { logAudit } from "@/lib/audit";

/**
 * Les données d'un client, en ZIP, pour les lui remettre sur sa demande
 * (RGPD-07). Réservé à un compte connecté de son cabinet ; tracé au
 * journal comme une consultation de sa fiche.
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user?.organizationId) return new Response("Not found", { status: 404 });

  const { id } = await context.params;
  const exported = await buildClientExport(await currentDb(), id);
  if (!exported) return new Response("Not found", { status: 404 });

  await logAudit({ userId: user.id, action: "CLIENT_VIEWED", entityType: "Client", entityId: id, metadata: { export: true } });

  return new Response(Buffer.from(exported.zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${exported.fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
