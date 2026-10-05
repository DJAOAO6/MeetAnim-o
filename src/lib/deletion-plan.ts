import { createHash } from "node:crypto";
import { pseudonymize } from "@/lib/privacy";

/**
 * Plan de la purge d'un espace professionnel (chantier C9) : ce qui est
 * supprimé, dans quel ordre, et comment retrouver ce qui n'est pas rangé
 * sous l'espace. Pur et sans base, pour être vérifié à part — le test de
 * couverture du schéma (phase 4) s'appuie sur ces listes.
 */

/**
 * Tables rattachées à l'espace par `organizationId`, dans l'ordre où les
 * supprimer : les enfants avant leurs parents, et tout ce qui désigne un
 * compte avant les comptes (StudioDocument bloque la suppression de son
 * auteur). Chaque table est vidée par un `deleteMany` explicite — jamais par
 * une cascade implicite seule.
 */
export const ORGANIZATION_TABLES = [
  "AppointmentCalendarEvent",
  "TourStop",
  "TourRun",
  "Reminder",
  "Consultation",
  "AnimalDocument",
  "StudioDocument",
  "StudioDocumentTemplate",
  "Appointment",
  "Animal",
  "AnimalPlace",
  "Client",
  "ClientImport",
  "BlockedSlot",
  "City",
  "Tour",
  "Zone",
  "Service",
  "SavedPlace",
  "MapView",
  "BusinessProfile",
] as const;

/** Tables rattachées à un compte de l'espace (pas de colonne d'espace). */
export const USER_TABLES = [
  "CalendarConnection",
  "Session",
  "PasswordResetToken",
  "TwoFactorCode",
  "AgendaPreferences",
  "TourPreferences",
  "DashboardPreferences",
] as const;

/** Tables nettoyées par d'autres critères, puis les comptes et l'espace. */
export const OTHER_TABLES = ["Invitation", "AuditLog", "RateLimitEvent", "User", "Organization"] as const;

export type PurgedTable = (typeof ORGANIZATION_TABLES)[number] | (typeof USER_TABLES)[number] | (typeof OTHER_TABLES)[number];

/** Empreinte de l'identifiant d'un espace : SHA-256 simple (identifiant aléatoire, indevinable). */
export function organizationHash(organizationId: string): string {
  return createHash("sha256").update(`organization:${organizationId}`).digest("hex");
}

/** Empreinte d'un lien de réservation : HMAC, car un lien se devine (« prenom-nom »). */
export function slugHash(slug: string): string {
  return pseudonymize(`slug:${slug}`);
}

/** Durée pendant laquelle le lien d'un espace effacé ne peut pas être repris. */
export const SLUG_QUARANTINE_MS = 183 * 24 * 60 * 60 * 1000;

/**
 * Clés de limitation de débit qui désignent ces adresses et ces comptes :
 * l'empreinte actuelle et l'ancienne forme en clair (antérieure à la phase 2).
 */
export function rateLimitKeysFor(emails: string[], userIds: string[]): string[] {
  const keys = new Set<string>();
  for (const raw of emails) {
    const email = raw.trim().toLowerCase();
    if (!email) continue;
    for (const scope of ["login", "reset", "public-booking:email"]) {
      keys.add(`${scope}:${pseudonymize(email)}`);
      keys.add(`${scope}:${email}`);
    }
  }
  for (const userId of userIds) {
    for (const scope of ["client-import", "tour-optimize", "tour-route", "tour-reverse-geocode"]) keys.add(`${scope}:${userId}`);
  }
  return [...keys];
}

/**
 * La purge est-elle permise sur cette base ? En production, oui. Ailleurs,
 * seulement sur une base de test (nom en `_test`) ou sur autorisation
 * explicite : pendant le développement, la base locale est celle des données
 * de travail, et un effacement s'y fait par erreur une seule fois.
 */
export function purgeAllowed(env: { NODE_ENV?: string; DATABASE_URL?: string; DB_URL?: string; ALLOW_ORGANIZATION_PURGE?: string }): boolean {
  if (env.NODE_ENV === "production") return true;
  if (env.ALLOW_ORGANIZATION_PURGE === "1") return true;
  const url = env.DATABASE_URL ?? env.DB_URL ?? "";
  try {
    return new URL(url).pathname.replace(/^\//, "").endsWith("_test");
  } catch {
    return false;
  }
}

export { DELETION_REASONS, type DeletionReasonKey } from "@/lib/deletion-reasons";

export const DELETION_DELAY_MS = 7 * 24 * 60 * 60 * 1000;
