import "server-only";
import { getCurrentUser, type CurrentUser } from "@/lib/auth/dal";

export type PlatformAccess =
  | { ok: true; user: CurrentUser }
  | { ok: false; reason: "not-signed-in" | "not-platform-admin" | "in-assistance" | "two-factor-required"; user: CurrentUser | null };

/**
 * L'accès à la super-administration, et pourquoi il est refusé.
 *
 * Trois conditions, toutes vérifiées à chaque requête :
 * - le compte porte le rôle de plateforme ;
 * - il n'est pas lui-même en train d'assister quelqu'un — une session
 *   d'assistance agit au nom d'un professionnel, pas de la plateforme ;
 * - la double authentification est activée. Ce compte ouvre les données de
 *   tous les cabinets : un mot de passe seul ne suffit pas à le protéger.
 */
export async function platformAccess(): Promise<PlatformAccess> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, reason: "not-signed-in", user: null };
  if (user.assistance) return { ok: false, reason: "in-assistance", user };
  if (!user.platformAdmin) return { ok: false, reason: "not-platform-admin", user };
  if (!user.twoFactorEnabled) return { ok: false, reason: "two-factor-required", user };
  return { ok: true, user };
}
