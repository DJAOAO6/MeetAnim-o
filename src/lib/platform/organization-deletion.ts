import "server-only";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { providerFor, getFreshAccessToken } from "@/lib/calendar/calendar-connections";
import { decryptCalendarToken } from "@/lib/calendar/calendar-encryption";
import { eraseMailjetContact } from "@/lib/email/provider";
import { ORGANIZATION_TABLES, organizationHash, purgeAllowed, rateLimitKeysFor, slugHash, type DeletionReasonKey } from "@/lib/deletion-plan";

/**
 * Effacement définitif d'un espace professionnel (chantier C9, phase 3).
 *
 * Sans session : appelée par le planificateur à l'échéance, ou par
 * « Effacer immédiatement » depuis la plateforme (qui vérifie platformAccess).
 *
 * 1. Prestataires d'abord, au mieux : événements créés dans les agendas
 *    Google puis révocation des jetons ; contacts Mailjet des membres et des
 *    clients (sauf adresse encore présente dans un autre espace). Chaque échec
 *    est compté, sans donnée personnelle, et n'empêche pas la suite.
 * 2. Base, en une transaction : un deleteMany explicite par table, dans
 *    l'ordre des dépendances (deletion-plan.ts), l'espace déclaré à la base
 *    pour que ses règles RLS interdisent de toucher un autre cabinet ; puis
 *    vérification qu'il ne reste rien.
 * 3. DeletionRecord : la preuve, sans donnée personnelle.
 */

export type ThirdPartyReport = {
  googleEventsDeleted: number;
  googleEventsFailed: number;
  googleTokensRevoked: number;
  googleTokensFailed: number;
  mailjetDeleted: number;
  mailjetAbsent: number;
  mailjetFailed: number;
  mailjetKeptShared: number;
  mailjetConfigured: boolean;
};

export type PurgeResult =
  | { ok: true; rowCounts: Record<string, number>; thirdParties: ThirdPartyReport }
  | { ok: false; error: string };

export async function purgeOrganization(organizationId: string, options: { requestedByUserId?: string | null; reason?: DeletionReasonKey } = {}): Promise<PurgeResult> {
  if (!purgeAllowed(process.env)) {
    return { ok: false, error: "Effacement refusé : hors production, il n’est permis que sur une base de test." };
  }

  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { id: true, users: { select: { id: true, email: true } }, businessProfiles: { select: { slug: true, email: true } } },
  });
  if (!organization) return { ok: false, error: "Cet espace n’existe plus." };

  const userIds = organization.users.map((user) => user.id);
  const userEmails = organization.users.map((user) => user.email.trim().toLowerCase());
  const clientEmails = (await prisma.client.findMany({ where: { organizationId, email: { not: "" } }, select: { email: true } })).map((client) => client.email.trim().toLowerCase());
  const profileEmails = organization.businessProfiles.map((profile) => profile.email.trim().toLowerCase()).filter(Boolean);
  const slugs = organization.businessProfiles.map((profile) => profile.slug);
  const emails = [...new Set([...userEmails, ...clientEmails, ...profileEmails])];

  const thirdParties = await eraseThirdParties(organizationId, userIds, emails);

  const rowCounts = await prisma.$transaction(async (tx) => {
    // L'espace est déclaré à la base : ses règles RLS limitent les tables
    // cloisonnées à ce seul cabinet, quoi que contienne une requête.
    await tx.$executeRaw`SELECT set_config('app.organization_id', ${organizationId}, true)`;
    const counts: Record<string, number> = {};
    const where = { organizationId };

    counts.AppointmentCalendarEvent = (await tx.appointmentCalendarEvent.deleteMany({ where })).count;
    counts.TourStop = (await tx.tourStop.deleteMany({ where })).count;
    counts.TourRun = (await tx.tourRun.deleteMany({ where })).count;
    counts.Reminder = (await tx.reminder.deleteMany({ where })).count;
    counts.Consultation = (await tx.consultation.deleteMany({ where })).count;
    counts.AnimalDocument = (await tx.animalDocument.deleteMany({ where })).count;
    counts.StudioDocument = (await tx.studioDocument.deleteMany({ where })).count;
    counts.StudioDocumentTemplate = (await tx.studioDocumentTemplate.deleteMany({ where })).count;
    counts.Appointment = (await tx.appointment.deleteMany({ where })).count;
    counts.Animal = (await tx.animal.deleteMany({ where })).count;
    counts.AnimalPlace = (await tx.animalPlace.deleteMany({ where })).count;
    counts.Client = (await tx.client.deleteMany({ where })).count;
    counts.ClientImport = (await tx.clientImport.deleteMany({ where })).count;
    counts.BlockedSlot = (await tx.blockedSlot.deleteMany({ where })).count;
    counts.City = (await tx.city.deleteMany({ where })).count;
    counts.Tour = (await tx.tour.deleteMany({ where })).count;
    counts.Zone = (await tx.zone.deleteMany({ where })).count;
    counts.Service = (await tx.service.deleteMany({ where })).count;
    counts.SavedPlace = (await tx.savedPlace.deleteMany({ where })).count;
    counts.MapView = (await tx.mapView.deleteMany({ where })).count;
    counts.BusinessProfile = (await tx.businessProfile.deleteMany({ where })).count;

    // Ce qui appartient aux comptes de l'espace.
    const byUser = { userId: { in: userIds } };
    counts.CalendarConnection = (await tx.calendarConnection.deleteMany({ where: byUser })).count;
    // Sessions des membres, et assistances qu'un membre (compte de plateforme) aurait ouvertes.
    counts.Session = (await tx.session.deleteMany({ where: { OR: [byUser, { impersonatorId: { in: userIds } }] } })).count;
    counts.PasswordResetToken = (await tx.passwordResetToken.deleteMany({ where: byUser })).count;
    counts.TwoFactorCode = (await tx.twoFactorCode.deleteMany({ where: byUser })).count;
    counts.AgendaPreferences = (await tx.agendaPreferences.deleteMany({ where: byUser })).count;
    counts.TourPreferences = (await tx.tourPreferences.deleteMany({ where: byUser })).count;
    counts.DashboardPreferences = (await tx.dashboardPreferences.deleteMany({ where: byUser })).count;

    // Invitations de l'espace, ou adressées à l'un de ses membres.
    const invitations = await tx.invitation.findMany({ where: { OR: [{ organizationId }, { email: { in: userEmails } }] }, select: { id: true } });
    const invitationIds = invitations.map((invitation) => invitation.id);
    counts.Invitation = (await tx.invitation.deleteMany({ where: { id: { in: invitationIds } } })).count;

    // Journal : celui de l'espace, et les lignes de plateforme qui le
    // désignent (l'espace, ses comptes, ses invitations). Les actions qu'un
    // de ses membres a faites ailleurs en tant que plateforme restent au
    // journal de l'espace concerné (leur auteur y devient anonyme).
    counts.AuditLog = (await tx.auditLog.deleteMany({
      where: {
        OR: [
          { organizationId },
          { userId: { in: userIds }, organizationId: null },
          { entityType: "Organization", entityId: organizationId },
          { entityType: "User", entityId: { in: userIds } },
          { entityType: "Invitation", entityId: { in: invitationIds } },
        ],
      },
    })).count;

    counts.RateLimitEvent = (await tx.rateLimitEvent.deleteMany({ where: { key: { in: rateLimitKeysFor(emails, userIds) } } })).count;
    counts.User = (await tx.user.deleteMany({ where })).count;
    counts.Organization = (await tx.organization.deleteMany({ where: { id: organizationId } })).count;

    // Vérification, dans la même transaction : il ne reste rien.
    const leftovers = await Promise.all(ORGANIZATION_TABLES.map(async (table) => [table, await countRows(tx, table, organizationId)] as const));
    const remaining = leftovers.filter(([, count]) => count > 0);
    if (remaining.length > 0 || (await tx.user.count({ where })) > 0 || (await tx.organization.count({ where: { id: organizationId } })) > 0) {
      throw new Error(`Effacement incomplet : ${remaining.map(([table, count]) => `${table} (${count})`).join(", ") || "comptes ou espace"}.`);
    }
    return counts;
  }, { timeout: 120_000, maxWait: 15_000 });

  const now = new Date();
  const hash = organizationHash(organizationId);
  await prisma.deletionRecord.upsert({
    where: { organizationHash: hash },
    create: {
      organizationHash: hash,
      slugHash: slugs[0] ? slugHash(slugs[0]) : null,
      reason: options.reason ?? "OTHER",
      requestedAt: now,
      requestedByUserId: options.requestedByUserId ?? null,
      purgedAt: now,
      rowCounts: rowCounts as Prisma.InputJsonValue,
    },
    update: { purgedAt: now, rowCounts: rowCounts as Prisma.InputJsonValue },
  });

  // Hors requête (planificateur), il n'y a pas de cache à invalider.
  try {
    for (const slug of slugs) revalidatePath(`/reserver/${slug}`);
    revalidatePath("/plateforme");
  } catch {
    // Sans contexte de requête : rien à faire.
  }

  return { ok: true, rowCounts, thirdParties };
}

/** Lignes restantes d'une table rattachée à l'espace (vérification de fin de purge). */
async function countRows(tx: Prisma.TransactionClient, table: (typeof ORGANIZATION_TABLES)[number], organizationId: string): Promise<number> {
  const rows = await tx.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`SELECT count(*) AS count FROM ${Prisma.raw(`"${table}"`)} WHERE "organizationId" = ${organizationId}`);
  return Number(rows[0]?.count ?? 0);
}

/** Prestataires : Google (événements, jetons) puis Mailjet. Jamais bloquant. */
async function eraseThirdParties(organizationId: string, userIds: string[], emails: string[]): Promise<ThirdPartyReport> {
  const report: ThirdPartyReport = {
    googleEventsDeleted: 0,
    googleEventsFailed: 0,
    googleTokensRevoked: 0,
    googleTokensFailed: 0,
    mailjetDeleted: 0,
    mailjetAbsent: 0,
    mailjetFailed: 0,
    mailjetKeptShared: 0,
    mailjetConfigured: Boolean(process.env.MAILJET_API_KEY && process.env.MAILJET_API_SECRET),
  };

  const connections = await prisma.calendarConnection.findMany({ where: { userId: { in: userIds } } });
  for (const connection of connections) {
    const provider = providerFor(connection.provider);
    const events = await prisma.appointmentCalendarEvent.findMany({ where: { connectionId: connection.id }, select: { externalEventId: true } });
    try {
      const accessToken = await getFreshAccessToken(connection);
      for (const event of events) {
        try {
          await provider.deleteEvent(accessToken, connection.calendarId, event.externalEventId);
          report.googleEventsDeleted += 1;
        } catch {
          report.googleEventsFailed += 1;
        }
      }
    } catch {
      report.googleEventsFailed += events.length;
    }
    try {
      await provider.revokeToken(decryptCalendarToken(connection.refreshTokenEncrypted));
      report.googleTokensRevoked += 1;
    } catch {
      report.googleTokensFailed += 1;
    }
  }

  if (report.mailjetConfigured && emails.length > 0) {
    // Un même propriétaire peut être client de deux professionnels : le compte
    // Mailjet est commun, son contact reste tant qu'un autre espace l'utilise.
    const shared = new Set((await prisma.$queryRaw<Array<{ email: string }>>`
      SELECT lower(email) AS email FROM "Client" WHERE "organizationId" <> ${organizationId} AND lower(email) = ANY(${emails})
      UNION SELECT lower(email) FROM "User" WHERE ("organizationId" IS NULL OR "organizationId" <> ${organizationId}) AND lower(email) = ANY(${emails})
      UNION SELECT lower(email) FROM "BusinessProfile" WHERE "organizationId" <> ${organizationId} AND lower(email) = ANY(${emails})`).map((row) => row.email));
    for (const email of emails) {
      if (shared.has(email)) {
        report.mailjetKeptShared += 1;
        continue;
      }
      const outcome = await eraseMailjetContact(email);
      if (outcome === "deleted") report.mailjetDeleted += 1;
      else if (outcome === "absent") report.mailjetAbsent += 1;
      else report.mailjetFailed += 1;
    }
  }

  if (report.googleEventsFailed || report.googleTokensFailed || report.mailjetFailed) {
    console.warn(`[effacement] prestataires en échec pour l'espace ${organizationHash(organizationId).slice(0, 12)} : ${JSON.stringify({ google: report.googleEventsFailed + report.googleTokensFailed, mailjet: report.mailjetFailed })}`);
  }
  return report;
}

/** Espaces dont l'effacement programmé est échu (planificateur). */
export async function purgeDueOrganizations(now: Date = new Date(), onlyOrganizationId?: string): Promise<{ purged: number; failed: number }> {
  const due = await prisma.organization.findMany({
    where: { deletionScheduledFor: { lte: now }, ...(onlyOrganizationId ? { id: onlyOrganizationId } : {}) },
    select: { id: true },
  });
  let purged = 0;
  let failed = 0;
  for (const organization of due) {
    const record = await prisma.deletionRecord.findUnique({ where: { organizationHash: organizationHash(organization.id) }, select: { reason: true, requestedByUserId: true } });
    const result = await purgeOrganization(organization.id, { reason: record?.reason, requestedByUserId: record?.requestedByUserId });
    if (result.ok) purged += 1;
    else {
      failed += 1;
      console.error(`[effacement] échec pour l'espace ${organizationHash(organization.id).slice(0, 12)} : ${result.error}`);
    }
  }
  return { purged, failed };
}
