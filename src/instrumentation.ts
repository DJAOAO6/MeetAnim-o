/**
 * Appelé une fois au démarrage du serveur Next.js.
 *
 * Démarre le planificateur des tâches de fond (rappels de rendez-vous,
 * relances dues, journées de tournée) — voir src/lib/scheduler/start.ts.
 *
 * En production seulement, par défaut : la base de développement contient
 * des données réalistes, et un serveur de développement ne doit jamais
 * envoyer de rappel à un vrai client. SCHEDULER_ENABLED=1 ou 0 force le
 * choix dans un sens ou dans l'autre.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // La seconde barrière (cloisonnement dans la base) peut être inerte sans
  // que rien ne casse : il suffit que le compte de connexion soit
  // superutilisateur. On le vérifie, et on le dit, plutôt que de le supposer.
  try {
    const { checkDatabaseBarrier } = await import("@/lib/db-barrier");
    const barrier = await checkDatabaseBarrier();
    if (barrier.active) {
      console.info(`[cloisonnement] seconde barrière active (compte « ${barrier.role} »).`);
    } else {
      console.warn(`[cloisonnement] ATTENTION : seconde barrière inactive — ${barrier.reason} (compte « ${barrier.role} »). Le cloisonnement ne repose plus que sur l'application.`);
    }
  } catch (error) {
    console.warn("[cloisonnement] impossible de vérifier la seconde barrière :", error instanceof Error ? error.message : error);
  }

  // Super-administration : le rôle est décidé hors de l'application, par
  // PLATFORM_ADMIN_EMAILS, et appliqué ici. Jamais par un écran.
  try {
    const { syncPlatformAdmins } = await import("@/lib/platform/grants");
    const result = await syncPlatformAdmins();
    if (result) {
      console.info(`[plateforme] ${result.granted.length} compte(s) de super-administration${result.revoked ? `, ${result.revoked} retiré(s)` : ""}.`);
    }
  } catch (error) {
    console.warn("[plateforme] synchronisation du rôle impossible :", error instanceof Error ? error.message : error);
  }

  // Production sans Mailjet : rien ne part, et rien de personnel n'est écrit
  // dans les journaux à la place (voir ConsoleEmailProvider). On le dit
  // haut et fort au démarrage plutôt que de le découvrir au premier client
  // qui n'a pas reçu sa confirmation.
  if (process.env.NODE_ENV === "production") {
    const { emailConfigured } = await import("@/lib/email/provider");
    if (!emailConfigured()) {
      console.warn("[email] ATTENTION : Mailjet n'est pas configuré (MAILJET_API_KEY, MAILJET_API_SECRET, MAIL_FROM_ADDRESS). Aucun email n'est envoyé ; seuls le destinataire masqué et le sujet sont journalisés.");
    }
  }

  const override = process.env.SCHEDULER_ENABLED;
  const enabled = override === undefined ? process.env.NODE_ENV === "production" : override === "1";
  if (!enabled) return;

  const { startScheduler } = await import("@/lib/scheduler/start");
  startScheduler();
}
