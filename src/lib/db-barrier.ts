import "server-only";
import { prisma } from "@/lib/db";
import { inactiveBarrierAction } from "@/lib/barrier-policy";

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

/**
 * Vérifie la seconde barrière au démarrage et le consigne. En production,
 * sans elle, arrête le serveur (audit 2026-10, SEC-08 ; règle :
 * barrier-policy.ts). Ici et non dans instrumentation.ts : ce fichier-là est
 * aussi compilé pour le moteur Edge, qui ne connaît pas process.exit.
 */
export async function enforceDatabaseBarrier(): Promise<void> {
  let problem: string | null = null;
  try {
    const barrier = await checkDatabaseBarrier();
    if (barrier.active) {
      console.info(`[cloisonnement] seconde barrière active (compte « ${barrier.role} »).`);
      return;
    }
    problem = `${barrier.reason} (compte « ${barrier.role} »)`;
  } catch (error) {
    problem = `vérification impossible : ${error instanceof Error ? error.message : String(error)}`;
  }
  if (inactiveBarrierAction(process.env) === "stop") {
    console.error(`[cloisonnement] ARRÊT : seconde barrière inactive — ${problem}. Le serveur refuse de démarrer sans elle. Réparer le compte restreint (scripts/runtime-role.mjs), ou poser ALLOW_INACTIVE_DB_BARRIER=1 le temps de le faire.`);
    process.exit(1);
  }
  console.warn(`[cloisonnement] ATTENTION : seconde barrière inactive — ${problem}. Le cloisonnement ne repose plus que sur l'application.`);
}
