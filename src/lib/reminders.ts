import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/db";
import { formatFrenchDate } from "@/lib/format";
import type { Reminder, ReminderClientOption, ReminderStatus } from "@/data/reminders";
import type { ReminderDelay as DbReminderDelay, ReminderStatus as DbReminderStatus } from "@/generated/prisma/client";

const delayLabel: Record<DbReminderDelay, Reminder["delay"]> = {
  THREE_MONTHS: "3 mois",
  SIX_MONTHS: "6 mois",
  TWELVE_MONTHS: "12 mois",
  CUSTOM: "Date personnalisée",
};

const statusLabel: Record<DbReminderStatus, ReminderStatus> = {
  DUE: "À relancer",
  SENT: "Rappel envoyé",
  BOOKED: "RDV repris",
  IGNORED: "Ignoré",
  UPCOMING: "À venir",
};

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Lue à la fois par la page tableau de bord (getDashboardOverviewData) et
 * par le layout dashboard (pour alimenter la cloche de notifications) :
 * cache() déduplique ces deux lectures sur une même requête.
 */
export const getReminders = cache(async (): Promise<Reminder[]> => {
  const reminders = await prisma.reminder.findMany({
    include: { client: true, animal: true },
    orderBy: { dueDate: "asc" },
  });

  return reminders.map((reminder) => ({
    id: reminder.id,
    clientId: reminder.clientId,
    clientName: `${reminder.client.firstName} ${reminder.client.lastName}`,
    clientFirstName: reminder.client.firstName,
    clientEmail: reminder.client.email,
    animalId: reminder.animalId,
    animalName: reminder.animal.name,
    animalSpecies: reminder.animal.species,
    lastConsultation: formatFrenchDate(reminder.lastConsultation),
    delay: delayLabel[reminder.delay],
    dueDate: toIsoDate(reminder.dueDate),
    status: statusLabel[reminder.status],
    note: reminder.note ?? undefined,
  }));
});

export async function getReminderStats() {
  const [due, sent, booked, upcoming] = await Promise.all([
    prisma.reminder.count({ where: { status: "DUE" } }),
    prisma.reminder.count({ where: { status: "SENT" } }),
    prisma.reminder.count({ where: { status: "BOOKED" } }),
    prisma.reminder.count({ where: { status: "UPCOMING" } }),
  ]);

  return { due, sent, booked, upcoming };
}

export async function getReminderClientOptions(): Promise<ReminderClientOption[]> {
  const clients = await prisma.client.findMany({
    include: { animals: true },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

  return clients.map((client) => ({
    id: client.id,
    name: `${client.firstName} ${client.lastName}`,
    animals: client.animals.map((animal) => ({ id: animal.id, name: animal.name, species: animal.species })),
  }));
}
