import "server-only";

import { prisma } from "@/lib/db";
import { eraseMailjetContact, type MailjetErasure } from "@/lib/email/provider";

/**
 * Efface un contact chez Mailjet, sauf si l'adresse sert encore quelque
 * part : le compte Mailjet est commun à tous les espaces, et un même
 * propriétaire peut être client de deux professionnels. La question porte
 * donc sur toute la base, d'où le client non cloisonné ; elle ne rend
 * qu'un oui ou un non, jamais une ligne. Même règle que l'effacement d'un
 * espace (platform/organization-deletion.ts).
 */
export async function eraseMailjetContactIfUnused(email: string): Promise<MailjetErasure | "kept-shared"> {
  const address = email.trim().toLowerCase();
  if (!address) return "absent";
  const [row] = await prisma.$queryRaw<Array<{ used: boolean }>>`
    SELECT EXISTS (SELECT 1 FROM "Client" WHERE lower(email) = ${address})
        OR EXISTS (SELECT 1 FROM "User" WHERE lower(email) = ${address})
        OR EXISTS (SELECT 1 FROM "BusinessProfile" WHERE lower(email) = ${address}) AS used`;
  if (row?.used) return "kept-shared";
  return eraseMailjetContact(address);
}
