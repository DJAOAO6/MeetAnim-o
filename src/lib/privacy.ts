import { createHmac } from "node:crypto";

/**
 * Données personnelles hors de l'espace professionnel : ce qui sert à la
 * sécurité (limitation de débit, journal des connexions échouées) sans
 * garder une adresse email ou IP en clair.
 *
 * Une empreinte HMAC, et non un simple SHA-256 : sans le secret du serveur,
 * on ne peut pas retrouver une adresse en essayant une liste d'emails. Le
 * même secret donne la même empreinte : les tentatives d'une adresse se
 * comptent toujours ensemble, et la purge d'un espace (C9) retrouve les
 * lignes de ses membres en recalculant leur empreinte.
 */
export function pseudonymize(value: string, secret: string = process.env.SESSION_SECRET ?? ""): string {
  return createHmac("sha256", `pseudonyme:${secret}`).update(value.trim().toLowerCase()).digest("hex").slice(0, 32);
}

/** Clé de limitation de débit : la portée en clair, la personne en empreinte. */
export function rateLimitKey(scope: string, subject: string): string {
  return `${scope}:${pseudonymize(subject)}`;
}

const EMAIL_PATTERN = /[^\s@<>"'(),;:]+@[^\s@<>"'(),;:]+\.[^\s@<>"'(),;:]+/g;

/** Remplace toute adresse email d'un texte (message d'erreur d'un prestataire, par exemple). */
export function redactEmails(text: string): string {
  return text.replace(EMAIL_PATTERN, "[adresse masquée]");
}

/** « c•••@example.fr » : assez pour reconnaître un envoi, pas pour le rejouer. */
export function maskEmail(email: string): string {
  const [local, domain] = email.trim().split("@");
  if (!domain) return "[adresse masquée]";
  return `${local.charAt(0)}•••@${domain}`;
}
