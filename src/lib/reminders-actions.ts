"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/dal";
import { logAudit } from "@/lib/audit";
import { getEmailProvider } from "@/lib/email/provider";
import { reminderEmailTemplate } from "@/lib/email/templates";
import { getBusinessProfile } from "@/lib/business-profile-actions";
import { parseDateIdToLocalNoon } from "@/lib/booking-validation";
import type { Reminder } from "@/data/reminders";
import type { ReminderDelay as DbReminderDelay, ReminderStatus as DbReminderStatus } from "@/generated/prisma/client";

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
 * computeStatus ci-dessus ne s'exécute qu'à la création/modification d'un
 * rappel (saveReminderAction) — un rappel programmé "À venir" restait donc
 * affiché ainsi indéfiniment même une fois sa date de rappel passée, rien
 * ne rejouait jamais ce calcul. Destinée à la tâche planifiée quotidienne
 * (route /api/cron, AUDIT-PRODUIT-2026-08-30.md, finding P0 §5 — premier
 * exemple concret de "tâche de fond" que cette route débloque), mais reste
 * un utilitaire ordinaire : rejouable manuellement sans effet de bord si
 * rien n'a expiré (updateMany sur un ensemble vide ne fait rien).
 */
export async function refreshUpcomingRemindersAction(): Promise<{ updated: number }> {
  const result = await prisma.reminder.updateMany({
    where: { status: "UPCOMING", dueDate: { lte: referenceDate() } },
    data: { status: "DUE" },
  });
  if (result.count > 0) {
    revalidatePath("/dashboard/rappels");
    revalidatePath("/dashboard");
  }
  return { updated: result.count };
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
    await getEmailProvider().send({ to: reminder.client.email, ...reminderEmailTemplate({ professionalCompany: professional.company, message }) });
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

/**
 * Envoi groupé (bandeau de sélection) : contrairement à sendReminderAction,
 * aucun message n'a été relu/édité par la praticienne pour chaque
 * destinataire — on génère un message par défaut, cohérent avec celui
 * proposé dans ReminderModal. Chaque envoi est indépendant (Promise.allSettled) :
 * l'échec d'un email ne doit jamais bloquer les autres.
 */
export async function sendRemindersBulkAction(ids: string[]): Promise<BulkSendResult> {
  const user = await getCurrentUser();
  if (!user) return { sentIds: [], failedNames: [] };

  const reminders = await prisma.reminder.findMany({
    where: { id: { in: ids }, status: "DUE" },
    include: { client: true, animal: true },
  });
  const professional = await getBusinessProfile();

  const results = await Promise.allSettled(reminders.map(async (reminder) => {
    if (!reminder.client.email) throw new Error("Adresse email manquante");
    const message = [
      `Bonjour ${reminder.client.firstName},`,
      "",
      `Cela fait bientôt ${delayLabelFr[reminder.delay]} depuis la dernière séance de ${reminder.animal.name}.`,
      "",
      "Si vous souhaitez prévoir une nouvelle consultation, vous pouvez prendre rendez-vous directement ici :",
      "",
      bookingUrl(professional.slug),
    ].join("\n");

    await getEmailProvider().send({ to: reminder.client.email, ...reminderEmailTemplate({ professionalCompany: professional.company, message }) });
    await prisma.reminder.update({ where: { id: reminder.id }, data: { status: "SENT" } });
    await logAudit({ userId: user.id, action: "REMINDER_SENT", entityType: "Reminder", entityId: reminder.id, metadata: { source: "bulk" } });
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
