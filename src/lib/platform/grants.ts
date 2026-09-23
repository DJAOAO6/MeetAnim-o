import "server-only";
import { prisma } from "@/lib/db";

/**
 * Qui est super-administrateur ?
 *
 * Le rôle n'est **jamais** attribué par un écran : un formulaire qui le
 * permettrait serait la cible la plus précieuse de l'application, puisqu'il
 * ouvre les données de tous les cabinets. Il est donc décidé hors de
 * l'application, par la variable d'environnement du site :
 *
 *   PLATFORM_ADMIN_EMAILS=moi@exemple.fr,autre@exemple.fr
 *
 * et appliqué à chaque démarrage : les comptes listés reçoivent le rôle,
 * tous les autres le perdent. Pour le retirer à tout le monde, laisser la
 * variable vide. **Absente**, elle ne change rien — une variable oubliée lors
 * d'une reconfiguration ne doit pas priver silencieusement la plateforme de
 * son administrateur.
 */
export async function syncPlatformAdmins(): Promise<{ granted: string[]; revoked: number } | null> {
  const raw = process.env.PLATFORM_ADMIN_EMAILS;
  if (raw === undefined) return null;

  const emails = raw.split(",").map((email) => email.trim().toLowerCase()).filter(Boolean);
  const [revoked] = await prisma.$transaction([
    prisma.user.updateMany({ where: { platformAdmin: true, email: { notIn: emails } }, data: { platformAdmin: false } }),
    prisma.user.updateMany({ where: { email: { in: emails } }, data: { platformAdmin: true } }),
  ]);
  const granted = await prisma.user.findMany({ where: { platformAdmin: true }, select: { email: true } });
  return { granted: granted.map((user) => user.email), revoked: revoked.count };
}
