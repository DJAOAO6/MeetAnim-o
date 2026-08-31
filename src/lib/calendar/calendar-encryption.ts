import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

/**
 * Pas de "server-only" ici (contrairement aux autres fichiers de
 * src/lib/calendar/) : ce module ne touche ni Prisma ni aucune API Next —
 * uniquement le module crypto natif de Node — et reste ainsi testable
 * unitairement (node --test), comme booking-validation.ts. Il n'est appelé
 * que depuis des fichiers eux-mêmes serveur (calendar-connections.ts, les
 * routes OAuth), jamais depuis un composant client.
 *
 * Chiffrement des jetons OAuth (access/refresh token) avant stockage en
 * base — jamais en clair, jamais journalisés (intégrations calendrier).
 * AES-256-GCM via le module natif Node, pas de dépendance supplémentaire.
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH_BYTES = 12;

function resolveKey(): Buffer {
  const raw = process.env.CALENDAR_TOKEN_ENCRYPTION_KEY;
  if (!raw) throw new Error("CALENDAR_TOKEN_ENCRYPTION_KEY n'est pas configurée — voir docs/GOOGLE-CALENDAR-SETUP.md.");
  // Clé hex de 32 octets (64 caractères, ex. `openssl rand -hex 32`) si
  // fournie sous cette forme, sinon dérivée par scrypt depuis la chaîne
  // fournie — tolérant au format exact choisi en configuration.
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, "hex");
  return scryptSync(raw, "animeo-calendar-token-v1", 32);
}

/** Jamais journalisé : n'écrire le résultat que dans une colonne *Encrypted. */
export function encryptCalendarToken(plainText: string): string {
  const key = resolveKey();
  const iv = randomBytes(IV_LENGTH_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("base64"), authTag.toString("base64"), encrypted.toString("base64")].join(".");
}

export function decryptCalendarToken(payload: string): string {
  const key = resolveKey();
  const [ivB64, authTagB64, dataB64] = payload.split(".");
  if (!ivB64 || !authTagB64 || !dataB64) throw new Error("Jeton chiffré invalide (format inattendu).");
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(authTagB64, "base64"));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]);
  return decrypted.toString("utf8");
}
