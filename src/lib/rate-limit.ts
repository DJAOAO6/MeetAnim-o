import "server-only";
import { prisma } from "@/lib/db";

/**
 * Limiteur de débit simple, basé sur la base de données (fonctionne sur des
 * fonctions serverless sans état partagé en mémoire, contrairement à un
 * compteur en mémoire process).
 */
export async function isRateLimited(key: string, maxAttempts: number, windowMs: number): Promise<boolean> {
  const since = new Date(Date.now() - windowMs);
  const count = await prisma.rateLimitEvent.count({ where: { key, createdAt: { gte: since } } });
  return count >= maxAttempts;
}

export async function recordAttempt(key: string): Promise<void> {
  await prisma.rateLimitEvent.create({ data: { key } });
}
