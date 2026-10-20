import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Compare un secret reçu au secret attendu à temps constant (SEC-24) : un
 * « !== » s'arrête au premier caractère différent, et sa durée renseigne
 * sur le secret. Les empreintes ont la même longueur, ce que
 * timingSafeEqual exige.
 */
export function sameSecret(received: string, expected: string): boolean {
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(received), digest(expected));
}

/** L'en-tête « Authorization: Bearer <CRON_SECRET> » est-il le bon ? */
export function hasCronSecret(authorization: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && sameSecret(authorization ?? "", `Bearer ${secret}`);
}
