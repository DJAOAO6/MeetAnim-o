import "server-only";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";

export async function findActiveUserByEmail(email: string) {
  return prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}

// Empreinte d'un mot de passe aléatoire jamais conservé, au même coût que
// les vraies : de quoi comparer quand le compte n'existe pas.
let dummyHash: Promise<string> | null = null;

/**
 * Comparaison qui prend le même temps, que le compte existe ou non (audit
 * 2026-10, SEC-05) : sans compte, on compare quand même à une empreinte
 * factice, et la réponse est toujours « non ». Sans cela, la lenteur de
 * bcrypt trahissait les adresses qui ont un compte.
 */
export async function verifyPasswordOrDummy(passwordHash: string | null, password: string): Promise<boolean> {
  if (passwordHash) return verifyPassword(passwordHash, password);
  dummyHash ??= bcrypt.hash(crypto.randomUUID(), 12);
  await bcrypt.compare(password, await dummyHash);
  return false;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}
