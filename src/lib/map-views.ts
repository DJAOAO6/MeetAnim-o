import "server-only";
import { currentDb } from "@/lib/organization";
import { requireUser } from "@/lib/auth/dal";

export type MapViewSummary = { id: string; name: string; query: string };

/** Vues enregistrées du compte connecté, dans l'espace courant, par nom. */
export async function getMapViews(): Promise<MapViewSummary[]> {
  const user = await requireUser();
  const db = await currentDb();
  return db.mapView.findMany({ where: { userId: user.id }, orderBy: { name: "asc" }, select: { id: true, name: true, query: true } });
}
