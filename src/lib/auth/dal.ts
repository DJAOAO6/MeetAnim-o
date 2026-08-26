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
};

/**
 * Vérification "sûre" (contrairement au proxy, qui ne fait qu'un contrôle
 * optimiste sur la présence d'un cookie valide) : relit l'utilisateur en
 * base et invalide la session si le mot de passe a changé depuis l'émission
 * du jeton, ou si le compte a été désactivé.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const payload = await getSessionPayload();
  if (!payload?.userId) return null;

  const user = await prisma.user.findUnique({ where: { id: payload.userId } });
  if (!user || !user.active) return null;

  const issuedAtMs = payload.iat * 1000;
  if (issuedAtMs < user.passwordChangedAt.getTime()) return null;

  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
  };
});

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect("/dashboard");
  return user;
}
