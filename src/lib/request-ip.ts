import "server-only";
import { headers } from "next/headers";

/**
 * L'adresse IP du visiteur, lue en un seul endroit (audit 2026-10, SEC-02).
 *
 * Le site tourne derrière le serveur frontal de l'hébergeur (nginx). Le
 * premier élément de X-Forwarded-For, lu jusqu'ici, est écrit par le
 * navigateur lui-même : un attaquant le changeait à chaque requête et
 * échappait aux limites par adresse. On prend X-Real-IP, posé par le
 * serveur frontal, sinon le DERNIER élément de X-Forwarded-For, celui que
 * le serveur frontal ajoute (proxy_add_x_forwarded_for).
 *
 * À confirmer avec l'hébergeur : qu'un seul serveur frontal se trouve
 * devant l'application, et lequel de ces en-têtes il pose.
 *
 * Hors d'une requête (tâche planifiée), il n'y a pas d'en-têtes : null.
 */
export async function requestIp(): Promise<string | null> {
  let headerList: Headers;
  try {
    headerList = await headers();
  } catch {
    return null;
  }
  const realIp = headerList.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  const forwarded = headerList.get("x-forwarded-for")?.split(",").map((part) => part.trim()).filter(Boolean);
  return forwarded?.at(-1) ?? null;
}
