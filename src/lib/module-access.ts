import "server-only";
import { getCurrentUser } from "@/lib/auth/dal";
import { hasModule, moduleClosedMessage, type ModuleKey } from "@/lib/modules";

/**
 * Garde d'une action de module : refuse net quand le module n'est pas ouvert
 * à l'espace du compte connecté. Le menu ne propose déjà plus rien ; ceci
 * vaut pour une requête forgée, ou un écran resté ouvert au moment où le
 * module a été retiré.
 *
 * Sans compte connecté, laisse l'action répondre elle-même (elle exige une
 * session et le dira mieux).
 */
export async function requireModule(key: ModuleKey): Promise<void> {
  const user = await getCurrentUser();
  if (user && !hasModule(user.modules, key)) throw new Error(moduleClosedMessage(key));
}

/**
 * Pour les lectures appelées depuis le socle (fiche client, formulaire de
 * rendez-vous, recherche) : un module fermé n'y fait rien apparaître, sans
 * faire échouer l'écran.
 */
export async function moduleOpen(key: ModuleKey): Promise<boolean> {
  const user = await getCurrentUser();
  return hasModule(user?.modules, key);
}
