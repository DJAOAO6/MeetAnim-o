import "server-only";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { scopeArgs } from "@/lib/db-scope";

function connectionString(): string {
  // DB_URL est injectée par Iridflow (attach_db_to_site) pour une base
  // hébergée sur la plateforme ; DATABASE_URL reste la variable utilisée en
  // développement.
  return process.env.DATABASE_URL ?? process.env.DB_URL ?? "";
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient; scopedClients?: Map<string, ScopedPrismaClient> };

// Un client cloisonné par espace, construit à la demande : l'extension est
// posée une fois, pas à chaque requête. Conservé sur l'objet global en
// développement, où le rechargement à chaud réévalue ce module : sans cela,
// chaque rechargement ouvrirait une nouvelle réserve de connexions et
// laisserait la précédente derrière lui.
const scopedClients: Map<string, ScopedPrismaClient> = globalForPrisma.scopedClients ?? new Map();
if (process.env.NODE_ENV !== "production") globalForPrisma.scopedClients = scopedClients;

function createPrismaClient() {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: connectionString() }) });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

/**
 * Le même client, mais qui ne voit qu'un seul espace professionnel.
 *
 * Toute lecture y est restreinte à l'espace, toute création le reçoit, et
 * déplacer une donnée vers un autre espace est refusé (src/lib/db-scope.ts).
 * Le code métier doit passer par lui — `currentDb()` dans src/lib/organization.ts
 * le construit à partir du compte connecté — plutôt que par `prisma`, dont
 * l'usage direct est réservé à ce qui n'appartient à aucun cabinet :
 * connexion, sessions, jetons, journal d'audit, administration.
 */
export function dbFor(organizationId: string): ScopedPrismaClient {
  const existing = scopedClients.get(organizationId);
  if (existing) return existing;

  const scoped = buildScopedClient(organizationId);
  scopedClients.set(organizationId, scoped);
  scopedOrganizations.set(scoped, organizationId);
  return scoped;
}

/**
 * Le cabinet que sert un client cloisonné. Pour ce qui vit hors de la base
 * cloisonnée mais appartient quand même à un cabinet — les agendas Google
 * connectés par ses comptes, par exemple —, sans demander à chaque appelant
 * de transporter l'identifiant à côté du client.
 */
export function organizationIdOf(db: ScopedPrismaClient): string {
  const organizationId = scopedOrganizations.get(db);
  if (!organizationId) throw new Error("Client non cloisonné : cabinet inconnu.");
  return organizationId;
}

const scopedOrganizations = new WeakMap<object, string>();

function buildScopedClient(organizationId: string) {
  // Chaque connexion de ce client annonce à PostgreSQL le cabinet qu'elle
  // sert. La base s'en sert pour refuser d'elle-même les lignes des autres
  // (migration 20260922170000_row_level_security) : si une requête échappait
  // au filtre applicatif, elle ne ramènerait toujours rien d'étranger.
  //
  // Une réserve de connexions par cabinet, donc — volontairement petite. Le
  // jour où les cabinets se compteront par dizaines, il faudra soit une
  // réserve partagée qui repose le réglage à chaque emprunt, soit un
  // intermédiaire (PgBouncer) : c'est noté dans docs/PLAN-MULTI-COMPTES.md.
  //
  // Le cabinet est déclaré dans les paramètres d'ouverture de la connexion,
  // et non par une requête lancée juste après : il est ainsi en place avant
  // toute requête, sans course possible — et le pilote refusera bientôt deux
  // requêtes simultanées sur une même connexion.
  //
  // L'identifiant est inséré dans ces paramètres : on s'assure qu'il ne
  // contient que des caractères d'identifiant, pour qu'il ne puisse jamais
  // y glisser un autre réglage.
  if (!/^[A-Za-z0-9_-]+$/.test(organizationId)) {
    throw new Error("Identifiant d'espace professionnel invalide.");
  }
  const pool = new Pool({
    connectionString: connectionString(),
    max: 3,
    allowExitOnIdle: true,
    options: `-c app.organization_id=${organizationId}`,
  });

  const client = new PrismaClient({ adapter: new PrismaPg(pool) });
  return client.$extends({
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query }) {
          return query(scopeArgs(model, operation, args as Record<string, unknown>, organizationId) as typeof args);
        },
      },
    },
  });
}

export type ScopedPrismaClient = ReturnType<typeof buildScopedClient>;
