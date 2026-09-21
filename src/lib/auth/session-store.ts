import "server-only";
import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import { createSession, deleteSession, getSessionPayload, sessionDurationMs } from "@/lib/auth/session";

/**
 * Ouvre une session : ligne en base d'abord, cookie ensuite. Le jeton porte
 * l'identifiant de la ligne, que getCurrentUser relit à chaque requête.
 */
export async function openSession(userId: string) {
  const userAgent = (await headers()).get("user-agent")?.slice(0, 300) ?? null;
  const session = await prisma.session.create({
    data: { userId, expiresAt: new Date(Date.now() + sessionDurationMs), userAgent },
  });
  await createSession(userId, session.id);
}

/**
 * Déconnexion réelle : la session est révoquée en base avant que le cookie
 * soit effacé. Un jeton copié auparavant — sur un autre appareil, dans un
 * journal, par un tiers — cesse aussitôt de fonctionner.
 */
export async function closeCurrentSession() {
  const payload = await getSessionPayload();
  if (payload?.sid) {
    await prisma.session.updateMany({ where: { id: payload.sid, revokedAt: null }, data: { revokedAt: new Date() } });
  }
  await deleteSession();
  return payload;
}
