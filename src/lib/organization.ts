import "server-only";
import { dbFor, prisma, type ScopedPrismaClient } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/dal";

/**
 * Espace professionnel : l'activité d'un professionnel, propriétaire de
 * toutes ses données (clients, rendez-vous, tournées, comptes rendus…).
 *
 * Plusieurs comptes peuvent partager le même espace — un praticien, son
 * remplaçant, le secrétariat voient les mêmes clients, et c'est voulu. Ce
 * qui ne doit jamais se produire, c'est qu'un professionnel voie les données
 * d'un autre : c'est le cloisonnement que prépare ce module.
 *
 * Où en est le chantier (docs/PLAN-MULTI-COMPTES.md) :
 * - phase 1, faite : chaque donnée porte son espace, et la base le garantit ;
 * - phase 2, à venir : un client Prisma cloisonné filtrera d'office sur
 *   l'espace courant, pour qu'une requête sans cloisonnement devienne
 *   impossible à écrire par inadvertance.
 */

/**
 * L'espace du cabinet existant, créé par la migration qui a introduit les
 * espaces. Tant que l'inscription n'est pas ouverte (phase 4), c'est le seul,
 * et la base le pose par défaut sur toute écriture — ce qui permet au code
 * d'avant le chantier de continuer à fonctionner sans changement.
 *
 * Cette valeur par défaut est temporaire : elle disparaît à la fin de la
 * phase 2, quand toute écriture passera par le client cloisonné. Écrire cet
 * identifiant en dur ailleurs qu'ici serait donc une erreur.
 */
export const FIRST_ORGANIZATION_ID = "org-1002-pattes";

export type Organization = { id: string; name: string };

/**
 * L'espace auquel appartient un compte. `null` pour un compte de plateforme
 * (super-administration, phase 7), qui n'appartient à aucun cabinet et doit
 * donc choisir explicitement celui qu'il consulte.
 */
export async function organizationOf(userId: string): Promise<Organization | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { organization: { select: { id: true, name: true } } },
  });
  return user?.organization ?? null;
}

/**
 * L'espace courant, ou une erreur claire plutôt qu'une requête silencieuse
 * sur des données qui n'appartiennent à personne. Les appelants qui n'ont
 * pas de compte sous la main (page publique de réservation) passent par le
 * slug du cabinet, jamais par un identifiant fourni par le visiteur.
 */
export async function requireOrganizationOf(userId: string): Promise<Organization> {
  const organization = await organizationOf(userId);
  if (!organization) throw new Error("Ce compte n'appartient à aucun espace professionnel.");
  return organization;
}

/**
 * L'accès à la base du cabinet connecté : le point d'entrée du code métier.
 * Par convention, le résultat s'appelle `db` chez l'appelant —
 * `const db = await currentDb();` —, de sorte que `db.client.findMany(…)` se
 * lise comme avant, mais ne puisse plus sortir de l'espace.
 *
 * Tout ce qui passe par là ne peut voir, modifier ni supprimer que les
 * données de cet espace — non par discipline, mais parce que la restriction
 * est posée dans le client lui-même (src/lib/db-scope.ts). Le code qui a
 * besoin de `prisma` directement (connexion, sessions, administration) le
 * dit explicitement, et se relit comme tel.
 */
export async function currentDb(): Promise<ScopedPrismaClient> {
  return dbFor(await currentOrganizationId());
}

/**
 * L'espace du compte connecté. Utile là où l'identifiant lui-même est
 * nécessaire — par exemple pour filtrer des comptes, qui ne sont pas
 * cloisonnés d'office puisqu'un compte de plateforme n'appartient à aucun
 * cabinet.
 */
export async function currentOrganizationId(): Promise<string> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Aucun compte connecté : impossible de déterminer l'espace professionnel.");
  if (!user.organizationId) throw new Error("Ce compte n'appartient à aucun espace professionnel.");
  return user.organizationId;
}

/**
 * L'espace d'un cabinet à partir de son lien public (`/reserver/<slug>`).
 *
 * La page de réservation n'a pas de compte connecté : c'est le slug, donné
 * par l'URL, qui désigne le cabinet — jamais un identifiant d'espace envoyé
 * par le visiteur, qui pourrait alors désigner le cabinet de quelqu'un
 * d'autre.
 */
export async function organizationOfSlug(slug: string): Promise<Organization | null> {
  const profile = await prisma.businessProfile.findUnique({
    where: { slug },
    select: { organization: { select: { id: true, name: true } } },
  });
  return profile?.organization ?? null;
}

/**
 * Accès depuis un chemin sans compte connecté : la page de réservation et
 * ses actions publiques.
 *
 * Tant qu'il n'existe qu'un seul espace professionnel, c'est forcément le
 * sien. **Dès qu'un deuxième cabinet existe, cette fonction échoue** — et
 * c'est voulu : elle devra alors avoir été remplacée par une résolution du
 * cabinet à partir du slug de l'URL (phase 3), qui doit précéder l'ouverture
 * des inscriptions. Mieux vaut un refus franc qu'une page publique qui
 * montrerait les disponibilités du mauvais professionnel.
 */
export async function publicDb(): Promise<ScopedPrismaClient> {
  const organizations = await prisma.organization.findMany({ select: { id: true }, take: 2 });
  if (organizations.length === 0) throw new Error("Aucun espace professionnel : la base n'est pas initialisée.");
  if (organizations.length > 1) {
    throw new Error("Plusieurs espaces professionnels existent : un chemin public doit désormais résoudre le cabinet par son lien (slug).");
  }
  return dbFor(organizations[0].id);
}

/**
 * Lecture partagée entre l'espace professionnel et la page publique : celle
 * du compte connecté s'il y en a un, sinon celle du seul cabinet existant
 * (voir `publicDb`). Les écritures, elles, passent toujours par un chemin
 * identifié.
 */
export async function readDb(): Promise<ScopedPrismaClient> {
  const user = await getCurrentUser().catch(() => null);
  if (user?.organizationId) return dbFor(user.organizationId);
  return publicDb();
}
