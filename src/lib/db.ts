import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { scopeArgs } from "@/lib/db-scope";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// Un client cloisonné par espace, construit à la demande : l'extension est
// posée une fois, pas à chaque requête.
const scopedClients = new Map<string, ScopedPrismaClient>();

// DB_URL est injectée par Iridflow (attach_db_to_site) pour une base hébergée
// sur la plateforme ; DATABASE_URL reste la variable utilisée en dev/Neon.
function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL ?? process.env.DB_URL;
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
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
  return scoped;
}

function buildScopedClient(organizationId: string) {
  return prisma.$extends({
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
