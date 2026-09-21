"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/dal";
import { logAudit } from "@/lib/audit";
import { getEmailProvider, professionalReplyTo } from "@/lib/email/provider";
import { reminderEmailTemplate } from "@/lib/email/templates";
import { getBusinessProfile } from "@/lib/business-profile-actions";
import { parseDateIdToLocalNoon } from "@/lib/booking-validation";
import type { Reminder } from "@/data/reminders";
import type { Prisma, ReminderDelay as DbReminderDelay, ReminderStatus as DbReminderStatus } from "@/generated/prisma/client";

const dbDelay: Record<Reminder["delay"], DbReminderDelay> = {
  "3 mois": "THREE_MONTHS",
  "6 mois": "SIX_MONTHS",
  "12 mois": "TWELVE_MONTHS",
  "Date personnalisée": "CUSTOM",
};

const delayLabelFr: Record<DbReminderDelay, string> = {
  THREE_MONTHS: "3 mois",
  SIX_MONTHS: "6 mois",
  TWELVE_MONTHS: "12 mois",
  CUSTOM: "quelque temps",
};

function referenceDate(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
}

function computeStatus(dueDateId: string): DbReminderStatus {
  return parseDateIdToLocalNoon(dueDateId) <= referenceDate() ? "DUE" : "UPCOMING";
}


/**
 * Un rappel programmé doit référencer une antériorité réelle : reprend la
 * Consultation la plus récente de l'animal, ou à défaut son dernier
 * rendez-vous terminé (Appointment status COMPLETED). Aucun historique réel
 * → la date du jour, l'animal n'a simplement pas encore d'antériorité en
 * base — jamais une valeur inventée type "24 août 2026".
 */
async function computeLastConsultation(animalId: string): Promise<Date> {
  const [lastConsultation, lastAppointment] = await Promise.all([
    prisma.consultation.findFirst({ where: { animalId }, orderBy: { date: "desc" }, select: { date: true } }),
    prisma.appointment.findFirst({ where: { animalId, status: "COMPLETED" }, orderBy: { date: "desc" }, select: { date: true } }),
  ]);
  const candidates = [lastConsultation?.date, lastAppointment?.date].filter((date): date is Date => date != null);
  if (candidates.length === 0) return new Date();
  return candidates.reduce((latest, date) => (date > latest ? date : latest));
}

function bookingUrl(slug: string): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${appUrl}/reserver/${slug}`;
}

export type SaveReminderInput = {
  id?: string;
  clientId: string;
  animalId: string;
  dueDate: string;
  delay: Reminder["delay"];
  note: string;
};

export type ReminderActionResult = { ok: true } | { ok: false; error: string };

export async function saveReminderAction(input: SaveReminderInput): Promise<ReminderActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Session expirée, merci de vous reconnecter." };

  const animal = await prisma.animal.findUnique({ where: { id: input.animalId }, select: { id: true, clientId: true } });
  if (!animal || animal.clientId !== input.clientId) {
    return { ok: false, error: "Cet animal n'appartient pas au client sélectionné." };
  }

  const status = computeStatus(input.dueDate);
  const dueDate = parseDateIdToLocalNoon(input.dueDate);

  if (input.id) {
    const existing = await prisma.reminder.findUnique({ where: { id: input.id }, select: { id: true } });
    if (!existing) return { ok: false, error: "Ce rappel n'existe plus." };

    await prisma.reminder.update({
      where: { id: input.id },
      data: { clientId: input.clientId, animalId: input.animalId, dueDate, delay: dbDelay[input.delay], note: input.note || null, status },
    });
    await logAudit({ userId: user.id, action: "REMINDER_UPDATED", entityType: "Reminder", entityId: input.id });
  } else {
    const lastConsultation = await computeLastConsultation(input.animalId);
    const created = await prisma.reminder.create({
      data: { clientId: input.clientId, animalId: input.animalId, lastConsultation, dueDate, delay: dbDelay[input.delay], note: input.note || null, status },
    });
    await logAudit({ userId: user.id, action: "REMINDER_CREATED", entityType: "Reminder", entityId: created.id });
  }

  revalidatePath("/dashboard/rappels");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function ignoreReminderAction(id: string): Promise<ReminderActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Session expirée, merci de vous reconnecter." };

  const existing = await prisma.reminder.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return { ok: false, error: "Ce rappel n'existe plus." };

  await prisma.reminder.update({ where: { id }, data: { status: "IGNORED" } });
  await logAudit({ userId: user.id, action: "REMINDER_IGNORED", entityType: "Reminder", entityId: id });
  revalidatePath("/dashboard/rappels");
  revalidatePath("/dashboard");
  return { ok: true };
}

/**
 * Best-effort comme submitPublicBookingAction : un client sans email (champ
 * non obligatoire à la création d'une fiche) ne doit jamais faire planter
 * l'envoi, juste être signalé à l'utilisateur.
 */
export async function sendReminderAction(id: string, message: string): Promise<ReminderActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Session expirée, merci de vous reconnecter." };
  if (!message.trim()) return { ok: false, error: "Le message ne peut pas être vide." };

  const reminder = await prisma.reminder.findUnique({ where: { id }, include: { client: true } });
  if (!reminder) return { ok: false, error: "Ce rappel n'existe plus." };
  if (!reminder.client.email) {
    return { ok: false, error: `${reminder.client.firstName} ${reminder.client.lastName} n'a pas d'adresse email enregistrée.` };
  }

  const professional = await getBusinessProfile();
  try {
    await getEmailProvider().send({ to: reminder.client.email, ...reminderEmailTemplate({ professionalCompany: professional.company, message }), replyTo: professionalReplyTo(professional) });
  } catch (error) {
    console.error("Échec de l'envoi d'un email de rappel :", error);
    return { ok: false, error: "L'email n'a pas pu être envoyé. Réessayez plus tard." };
  }

  await prisma.reminder.update({ where: { id }, data: { status: "SENT" } });
  await logAudit({ userId: user.id, action: "REMINDER_SENT", entityType: "Reminder", entityId: id });
  revalidatePath("/dashboard/rappels");
  revalidatePath("/dashboard");
  return { ok: true };
}

export type BulkSendResult = { sentIds: string[]; failedNames: string[] };

type ReminderForBulkSend = Prisma.ReminderGetPayload<{ include: { client: true; animal: true } }>;

/**
 * Mécanique commune à tout envoi groupé de rappels (sélection manuelle ou
 * campagne de secteur) : chaque envoi est indépendant (Promise.allSettled),
 * l'échec d'un email ne doit jamais bloquer les autres — reprise ici plutôt
 * que dupliquée, un seul système d'envoi (spec phase 3.1 refonte tournées).
 */
async function dispatchReminderEmails(userId: string, reminders: ReminderForBulkSend[], buildMessage: (reminder: ReminderForBulkSend, professional: Awaited<ReturnType<typeof getBusinessProfile>>) => string, source: string): Promise<BulkSendResult> {
  const professional = await getBusinessProfile();

  const results = await Promise.allSettled(reminders.map(async (reminder) => {
    if (!reminder.client.email) throw new Error("Adresse email manquante");
    const message = buildMessage(reminder, professional);
    await getEmailProvider().send({ to: reminder.client.email, ...reminderEmailTemplate({ professionalCompany: professional.company, message }), replyTo: professionalReplyTo(professional) });
    await prisma.reminder.update({ where: { id: reminder.id }, data: { status: "SENT" } });
    await logAudit({ userId, action: "REMINDER_SENT", entityType: "Reminder", entityId: reminder.id, metadata: { source } });
    return reminder.id;
  }));

  const sentIds: string[] = [];
  const failedNames: string[] = [];
  results.forEach((result, index) => {
    if (result.status === "fulfilled") sentIds.push(result.value);
    else failedNames.push(reminders[index].animal.name);
  });

  revalidatePath("/dashboard/rappels");
  revalidatePath("/dashboard");
  return { sentIds, failedNames };
}

/**
 * Envoi groupé (bandeau de sélection) : contrairement à sendReminderAction,
 * aucun message n'a été relu/édité par la praticienne pour chaque
 * destinataire — on génère un message par défaut, cohérent avec celui
 * proposé dans ReminderModal.
 */
export async function sendRemindersBulkAction(ids: string[]): Promise<BulkSendResult> {
  const user = await getCurrentUser();
  if (!user) return { sentIds: [], failedNames: [] };

  const reminders = await prisma.reminder.findMany({
    where: { id: { in: ids }, status: "DUE" },
    include: { client: true, animal: true },
  });

  return dispatchReminderEmails(user.id, reminders, (reminder, professional) => [
    `Bonjour ${reminder.client.firstName},`,
    "",
    `Cela fait bientôt ${delayLabelFr[reminder.delay]} depuis la dernière séance de ${reminder.animal.name}.`,
    "",
    "Si vous souhaitez prévoir une nouvelle consultation, vous pouvez prendre rendez-vous directement ici :",
    "",
    bookingUrl(professional.slug),
  ].join("\n"), "bulk");
}

/**
 * Campagne "je passe dans le secteur" (mode tournée, phase 3.1) : proposée
 * depuis le bloc de remplissage de tournée (tour-fill.ts) pour les rappels
 * dus ou proches de l'échéance dont le client habite la zone de la tournée.
 * Message dédié mentionnant le secteur et la date, sinon même mécanique que
 * sendRemindersBulkAction. Re-filtre par statut DUE/UPCOMING au moment de
 * l'envoi (défensif : un rappel a pu être traité entre-temps par un autre
 * chemin).
 */
export async function sendZoneReminderCampaignAction(reminderIds: string[], zoneName: string, dateLabel: string): Promise<BulkSendResult> {
  const user = await getCurrentUser();
  if (!user) return { sentIds: [], failedNames: [] };
  if (reminderIds.length === 0) return { sentIds: [], failedNames: [] };

  const reminders = await prisma.reminder.findMany({
    where: { id: { in: reminderIds }, status: { in: ["DUE", "UPCOMING"] } },
    include: { client: true, animal: true },
  });

  return dispatchReminderEmails(user.id, reminders, (reminder, professional) => [
    `Bonjour ${reminder.client.firstName},`,
    "",
    `Cela fait bientôt ${delayLabelFr[reminder.delay]} depuis la dernière séance de ${reminder.animal.name}. Je passe justement dans le secteur ${zoneName} ${dateLabel} prochain.`,
    "",
    "Si vous souhaitez en profiter pour prévoir une nouvelle consultation, vous pouvez prendre rendez-vous directement ici :",
    "",
    bookingUrl(professional.slug),
  ].join("\n"), "tour-zone");
}
