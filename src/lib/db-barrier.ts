import "server-only";
import { prisma } from "@/lib/db";

export type BarrierStatus =
  | { active: true; role: string }
  | { active: false; role: string; reason: string };

/**
 * La seconde barrière — les règles de cloisonnement posées dans la base
 * (migration 20260922170000_row_level_security) — est-elle réellement en
 * vigueur pour le compte sous lequel l'application se connecte ?
 *
 * Elle ne l'est pas si ce compte est superutilisateur ou autorisé à
 * contourner ces règles : PostgreSQL les ignore alors, même forcées. Rien ne
 * le signale d'ordinaire — tout continue de fonctionner, le cloisonnement ne
 * repose simplement plus que sur l'application. D'où cette vérification, lue
 * au démarrage et consignée dans le journal du serveur.
 */
export async function checkDatabaseBarrier(): Promise<BarrierStatus> {
  const [row] = await prisma.$queryRaw<Array<{ role: string; superuser: boolean; bypass: boolean }>>`
    SELECT current_user AS role, rolsuper AS superuser, rolbypassrls AS bypass
    FROM pg_roles WHERE rolname = current_user`;
  if (!row) return { active: false, role: "inconnu", reason: "compte de connexion introuvable" };
  if (row.superuser) return { active: false, role: row.role, reason: "le compte est superutilisateur" };
  if (row.bypass) return { active: false, role: row.role, reason: "le compte peut contourner les règles (BYPASSRLS)" };
  return { active: true, role: row.role };
}
