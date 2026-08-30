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

// Rétention large, sans rapport avec un quelconque calcul de fenêtre — juste
// assez longue pour ne jamais dépasser la plus longue fenêtre de débit
// réellement utilisée dans l'app (1h, réservation par email). Purge
// opportuniste (nettoyage à la volée, AUDIT_COMPLET.md P2-26) plutôt qu'une
// tâche cron : cette app n'a pas d'infrastructure de planification externe,
// et recordAttempt() est déjà appelée sur tous les parcours limités en
// débit (connexion, réinitialisation de mot de passe, 2FA, réservation).
// Probabilité faible pour ne pas ajouter deux suppressions à chaque appel.
const purgeRetentionMs = 24 * 60 * 60 * 1000;
const purgeProbability = 0.02;

async function maybePurgeExpiredSecurityRecords(): Promise<void> {
  if (Math.random() >= purgeProbability) return;
  try {
    const cutoff = new Date(Date.now() - purgeRetentionMs);
    const now = new Date();
    await Promise.all([
      prisma.rateLimitEvent.deleteMany({ where: { createdAt: { lt: cutoff } } }),
      prisma.twoFactorCode.deleteMany({ where: { expiresAt: { lt: now } } }),
      prisma.passwordResetToken.deleteMany({ where: { expiresAt: { lt: now } } }),
    ]);
  } catch {
    // Best-effort : une purge manquée ne doit jamais faire échouer l'action
    // qui vient de vérifier ou d'enregistrer une limite de débit.
  }
}

export async function recordAttempt(key: string): Promise<void> {
  await prisma.rateLimitEvent.create({ data: { key } });
  await maybePurgeExpiredSecurityRecords();
}
