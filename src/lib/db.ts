import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// DB_URL est injectée par Iridflow (attach_db_to_site) pour une base hébergée
// sur la plateforme ; DATABASE_URL reste la variable utilisée en dev/Neon.
function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL ?? process.env.DB_URL;
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
