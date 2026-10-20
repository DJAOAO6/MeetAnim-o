import "server-only";

import { checkDatabaseBarrier } from "@/lib/db-barrier";
import { emailConfigured, emailDeliveryStats } from "@/lib/email/provider";

/**
 * L'état du service, vérifié en un seul endroit (audit 2026-10, EXP-02,
 * EXP-05, FONC-04, SEC-03). Lu par la route de surveillance (/api/health),
 * au démarrage (instrumentation.ts) et en tête de /plateforme.
 *
 * « critique » : le service ne fait pas ce qu'il promet (base injoignable,
 * cloisonnement inactif, e-mails qui ne partent pas) — la route répond 503
 * et une sonde externe peut prévenir. « attention » : un réglage à corriger,
 * sans panne immédiate.
 */
export type HealthCheck = { key: string; label: string; ok: boolean; severity: "critique" | "attention"; detail?: string };
export type SystemHealth = { ok: boolean; checks: HealthCheck[] };

export async function systemHealth(env: NodeJS.ProcessEnv = process.env): Promise<SystemHealth> {
  const production = env.NODE_ENV === "production";
  const checks: HealthCheck[] = [];

  try {
    const barrier = await checkDatabaseBarrier();
    checks.push({ key: "database", label: "Base de données joignable", ok: true, severity: "critique" });
    checks.push({ key: "barrier", label: "Cloisonnement par la base actif", ok: barrier.active, severity: production ? "critique" : "attention", detail: barrier.active ? undefined : barrier.reason });
  } catch {
    checks.push({ key: "database", label: "Base de données joignable", ok: false, severity: "critique" });
  }

  const configured = emailConfigured();
  checks.push({ key: "email", label: "Envoi d'e-mails configuré", ok: configured, severity: production ? "critique" : "attention" });
  const delivery = emailDeliveryStats();
  // Le dernier envoi a échoué : les codes de connexion, liens et
  // confirmations ne partent peut-être plus.
  const failing = Boolean(delivery.lastFailureAt && (!delivery.lastSuccessAt || delivery.lastFailureAt > delivery.lastSuccessAt));
  checks.push({ key: "email-delivery", label: "Derniers envois d'e-mails réussis", ok: !failing, severity: "critique", detail: failing ? `${delivery.failures} échec(s) depuis le démarrage` : undefined });

  const sessionSecret = env.SESSION_SECRET ?? "";
  checks.push({ key: "session-secret", label: "Secret des sessions d'au moins 32 caractères", ok: sessionSecret.length >= 32, severity: sessionSecret ? "attention" : "critique" });
  // Un secret par usage (SEC-03) : sans RUNTIME_DB_SECRET, le mot de passe du
  // compte restreint de la base dérive du secret des sessions.
  checks.push({ key: "runtime-secret", label: "Secret propre au compte restreint de la base", ok: !production || Boolean(env.RUNTIME_DB_SECRET), severity: "attention" });
  const appUrl = env.NEXT_PUBLIC_APP_URL ?? "";
  checks.push({ key: "app-url", label: "Adresse publique du site réglée", ok: !production || (appUrl.startsWith("https://") && !appUrl.includes("localhost")), severity: "attention", detail: production && !appUrl ? "les liens des e-mails mèneraient à localhost" : undefined });
  checks.push({ key: "platform-admins", label: "Compte de super-administration désigné", ok: Boolean(env.PLATFORM_ADMIN_EMAILS?.trim()), severity: "attention" });

  return { ok: checks.every((check) => check.ok || check.severity !== "critique"), checks };
}
