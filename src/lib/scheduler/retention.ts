import "server-only";

import { organizationIdOf, prisma, type ScopedPrismaClient } from "@/lib/db";
import { eraseClient, eraseClientOutside } from "@/lib/client-erasure";
import { logAudit } from "@/lib/audit";

/**
 * Durées de conservation (audit 2026-10, RGPD-06). Jusqu'ici, seules les
 * traces de sécurité de moins d'un jour étaient purgées ; tout le reste
 * était gardé sans limite.
 *
 * Règles décidées par Loïc le 2026-10-19, durées À FAIRE VALIDER par un
 * juriste (référentiels de la CNIL : gestion commerciale, journalisation) :
 * - journal des actions : 12 mois ;
 * - sessions terminées ou révoquées : 30 jours après leur fin ;
 * - invitations utilisées, révoquées ou expirées : 90 jours après ;
 * - fiche créée par une demande en ligne jamais acceptée : 6 mois après ;
 * - clients sans rendez-vous depuis 3 ans : signalés, jamais supprimés
 *   d'office (inactiveClientIds).
 */
const DAY_MS = 24 * 60 * 60 * 1000;
export const RETENTION = {
  auditLogDays: 365,
  endedSessionDays: 30,
  endedInvitationDays: 90,
  unacceptedRequestDays: 183,
  inactiveClientYears: 3,
} as const;

/** Lignes sans cabinet ou tous cabinets confondus : journal, sessions, invitations. */
export async function purgeExpiredRecords(now: Date = new Date()): Promise<{ auditLogs: number; sessions: number; invitations: number }> {
  const before = (days: number) => new Date(now.getTime() - days * DAY_MS);
  const sessionCutoff = before(RETENTION.endedSessionDays);
  const invitationCutoff = before(RETENTION.endedInvitationDays);
  const [auditLogs, sessions, invitations] = await Promise.all([
    prisma.auditLog.deleteMany({ where: { createdAt: { lt: before(RETENTION.auditLogDays) } } }),
    prisma.session.deleteMany({ where: { OR: [{ revokedAt: { lt: sessionCutoff } }, { expiresAt: { lt: sessionCutoff } }] } }),
    prisma.invitation.deleteMany({ where: { OR: [{ usedAt: { lt: invitationCutoff } }, { revokedAt: { lt: invitationCutoff } }, { expiresAt: { lt: invitationCutoff } }] } }),
  ]);
  return { auditLogs: auditLogs.count, sessions: sessions.count, invitations: invitations.count };
}

/**
 * Fiches créées par une demande de rendez-vous en ligne qui n'a jamais été
 * acceptée, six mois après : la personne n'est jamais devenue cliente.
 *
 * Prudence voulue : seulement si TOUS les rendez-vous de la fiche viennent
 * de la page publique (journal : source « public_booking ») et ont été
 * annulés — refusés ou expirés —, sans compte rendu, relance, consultation
 * ni import. Une fiche saisie par le professionnel n'est jamais touchée.
 * L'effacement suit la règle de toute suppression (client-erasure.ts).
 */
export async function purgeUnacceptedRequestClients(db: ScopedPrismaClient, now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - RETENTION.unacceptedRequestDays * DAY_MS);
  const candidates = await db.client.findMany({
    where: {
      createdAt: { lt: cutoff },
      importId: null,
      appointments: { some: {}, every: { status: "CANCELLED", updatedAt: { lt: cutoff } } },
      studioDocuments: { none: {} },
      reminders: { none: {} },
      animals: { every: { consultations: { none: {} } } },
    },
    select: { id: true, appointments: { select: { id: true } } },
    take: 50,
  });

  const organizationId = organizationIdOf(db);
  let erased = 0;
  for (const candidate of candidates) {
    const appointmentIds = candidate.appointments.map((appointment) => appointment.id);
    const fromPublicBooking = await prisma.auditLog.count({
      where: { organizationId, action: "APPOINTMENT_CREATED", entityId: { in: appointmentIds }, metadata: { path: ["source"], equals: "public_booking" } },
    });
    if (fromPublicBooking !== appointmentIds.length) continue;

    const erasure = await eraseClient(db, candidate.id, now);
    if (!erasure) continue;
    await logAudit({ userId: null, impersonatorId: null, organizationId, action: "CLIENT_DELETED", entityType: "Client", entityId: candidate.id, metadata: { automatic: true, reason: "unaccepted_request" } });
    await eraseClientOutside(organizationId, erasure);
    erased += 1;
  }
  return erased;
}

/**
 * Clients sans rendez-vous (hors annulés) depuis trois ans, et inscrits
 * depuis au moins aussi longtemps : signalés au professionnel, qui archive
 * ou supprime. Rien n'est fait d'office.
 */
export async function inactiveClientIds(db: ScopedPrismaClient, now: Date = new Date()): Promise<string[]> {
  const cutoff = new Date(now);
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - RETENTION.inactiveClientYears);
  const rows = await db.client.findMany({
    where: {
      archivedAt: null,
      createdAt: { lt: cutoff },
      appointments: { none: { date: { gte: cutoff }, status: { not: "CANCELLED" } } },
    },
    select: { id: true },
  });
  return rows.map((row) => row.id);
}
