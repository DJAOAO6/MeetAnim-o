import "server-only";
import { prisma } from "@/lib/db";

export type PlatformOrganization = {
  id: string;
  name: string;
  createdAt: Date;
  onboarded: boolean;
  slug: string | null;
  counts: { clients: number; appointments: number };
  accounts: Array<{
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: "ADMIN" | "PRACTITIONER" | "SECRETARY";
    active: boolean;
    platformAdmin: boolean;
    lastLoginAt: Date | null;
  }>;
};

export type PlatformAssistanceEntry = {
  id: string;
  action: "ASSISTANCE_STARTED" | "ASSISTANCE_ENDED";
  createdAt: Date;
  organizationName: string | null;
  assistedName: string | null;
  impersonatorName: string | null;
  reason: string;
};

/**
 * Vue d'ensemble de la plateforme : tous les cabinets, leurs comptes, et des
 * volumes — jamais le contenu (clients, rendez-vous, comptes rendus). Pour
 * voir le contenu d'un cabinet, il faut l'assister, ce qui est motivé et
 * journalisé. C'est volontaire : la liste doit permettre de retrouver le bon
 * compte, pas de parcourir les données de tout le monde.
 *
 * Lecture hors cloisonnement, par nature : c'est la seule vue qui voit
 * plusieurs cabinets. Réservée à `platformAccess()`, vérifié par l'appelant.
 */
export async function getPlatformOverview(): Promise<PlatformOrganization[]> {
  const organizations = await prisma.organization.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      createdAt: true,
      onboardedAt: true,
      businessProfiles: { select: { slug: true }, take: 1 },
      users: {
        orderBy: [{ active: "desc" }, { lastName: "asc" }],
        select: { id: true, email: true, firstName: true, lastName: true, role: true, active: true, platformAdmin: true, lastLoginAt: true },
      },
      _count: { select: { clients: true, appointments: true } },
    },
  });

  return organizations.map((organization) => ({
    id: organization.id,
    name: organization.name,
    onboarded: organization.onboardedAt !== null,
    createdAt: organization.createdAt,
    slug: organization.businessProfiles[0]?.slug ?? null,
    counts: { clients: organization._count.clients, appointments: organization._count.appointments },
    accounts: organization.users,
  }));
}

/** Les dernières assistances, toutes plateformes confondues. */
export async function getRecentAssistances(limit = 20): Promise<PlatformAssistanceEntry[]> {
  const rows = await prisma.auditLog.findMany({
    where: { action: { in: ["ASSISTANCE_STARTED", "ASSISTANCE_ENDED"] } },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      action: true,
      createdAt: true,
      metadata: true,
      organization: { select: { name: true } },
      user: { select: { firstName: true, lastName: true } },
      impersonator: { select: { firstName: true, lastName: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    action: row.action as PlatformAssistanceEntry["action"],
    createdAt: row.createdAt,
    organizationName: row.organization?.name ?? null,
    assistedName: row.user ? `${row.user.firstName} ${row.user.lastName}`.trim() : null,
    impersonatorName: row.impersonator ? `${row.impersonator.firstName} ${row.impersonator.lastName}`.trim() : null,
    reason: typeof row.metadata === "object" && row.metadata && "reason" in row.metadata ? String((row.metadata as { reason: unknown }).reason) : "",
  }));
}
