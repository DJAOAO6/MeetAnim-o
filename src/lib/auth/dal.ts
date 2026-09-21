import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSessionPayload } from "@/lib/auth/session";

export type CurrentUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: "ADMIN" | "PRACTITIONER" | "SECRETARY";
  permissions: string[];
};

/**
 * Vérification "sûre" (contrairement au proxy, qui ne fait qu'un contrôle
 * optimiste sur la présence d'un cookie valide) : relit l'utilisateur en
 * base et invalide la session si le mot de passe a changé depuis l'émission
 * du jeton, ou si le compte a été désactivé.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const payload = await getSessionPayload();
  if (!payload?.userId || !payload.sid) return null;

  // La session doit exister, appartenir à ce compte, ne pas être révoquée
  // (déconnexion) ni expirée : une seule lecture, utilisateur compris.
  const session = await prisma.session.findUnique({ where: { id: payload.sid }, include: { user: true } });
  if (!session || session.userId !== payload.userId || session.revokedAt || session.expiresAt.getTime() <= Date.now()) return null;

  const user = session.user;
  if (!user.active) return null;

  const issuedAtMs = payload.iat * 1000;
  if (issuedAtMs < user.passwordChangedAt.getTime()) return null;

  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    permissions: user.permissions,
  };
});

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (user) return user;

  // Un Server Component ne peut pas supprimer de cookie (réservé aux Server
  // Actions/Route Handlers) — si le jeton est cryptographiquement valide
  // mais rejeté par le contrôle base (compte désactivé, mot de passe changé
  // depuis), le contrôle optimiste du proxy le verrait comme valide et
  // renverrait vers /dashboard, créant une boucle infinie avec cette
  // redirection. Ce paramètre indique au proxy de supprimer le cookie au
  // lieu de lui faire confiance.
  const payload = await getSessionPayload();
  redirect(payload?.userId ? "/login?sessionExpired=1" : "/login");
}

export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect("/dashboard");
  return user;
}
