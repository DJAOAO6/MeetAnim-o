"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { logAudit } from "@/lib/audit";

export type CalendarActionResult = { ok: true } | { ok: false; error: string };

const SETTINGS_PATH = "/dashboard/parametres";

export async function disconnectGoogleCalendarAction(): Promise<CalendarActionResult> {
  const user = await requireUser();

  const connection = await prisma.calendarConnection.findUnique({ where: { userId_provider: { userId: user.id, provider: "GOOGLE" } } });
  if (!connection) return { ok: false, error: "Aucune connexion Google Agenda à déconnecter." };

  // onDelete: Cascade supprime les liaisons AppointmentCalendarEvent avec —
  // les rendez-vous internes ne sont jamais touchés (voir schema.prisma).
  await prisma.calendarConnection.delete({ where: { id: connection.id } });
  await logAudit({ userId: user.id, action: "CALENDAR_DISCONNECTED", entityType: "CalendarConnection", entityId: connection.id, metadata: { provider: "GOOGLE" } });

  revalidatePath(SETTINGS_PATH);
  return { ok: true };
}

export type UpdateGoogleCalendarSettingsInput = {
  calendarId?: string;
  calendarName?: string;
  syncAppointments: boolean;
  syncUpdates: boolean;
  deleteCancelledEvents: boolean;
  blockExternalBusySlots: boolean;
};

export async function updateGoogleCalendarSettingsAction(input: UpdateGoogleCalendarSettingsInput): Promise<CalendarActionResult> {
  const user = await requireUser();

  const connection = await prisma.calendarConnection.findUnique({ where: { userId_provider: { userId: user.id, provider: "GOOGLE" } } });
  if (!connection) return { ok: false, error: "Google Agenda n'est pas connecté." };

  await prisma.calendarConnection.update({
    where: { id: connection.id },
    data: {
      ...(input.calendarId && input.calendarName ? { calendarId: input.calendarId, calendarName: input.calendarName } : {}),
      syncAppointments: input.syncAppointments,
      syncUpdates: input.syncUpdates,
      deleteCancelledEvents: input.deleteCancelledEvents,
      blockExternalBusySlots: input.blockExternalBusySlots,
    },
  });
  await logAudit({ userId: user.id, action: "CALENDAR_SETTINGS_UPDATED", entityType: "CalendarConnection", entityId: connection.id, metadata: { provider: "GOOGLE" } });

  revalidatePath(SETTINGS_PATH);
  return { ok: true };
}

export type IcsFeedActionResult = { ok: true; url: string } | { ok: false; error: string };

export async function regenerateIcsFeedTokenAction(): Promise<IcsFeedActionResult> {
  const user = await requireUser();

  // Jamais l'id utilisateur directement dans l'URL du flux (étape 17) : un
  // jeton aléatoire long, impossible à deviner, régénérable indépendamment
  // de l'identifiant du compte.
  const token = randomBytes(24).toString("base64url");
  await prisma.user.update({ where: { id: user.id }, data: { icsFeedToken: token } });
  await logAudit({ userId: user.id, action: "CALENDAR_FEED_TOKEN_REGENERATED", entityType: "User", entityId: user.id });

  revalidatePath(SETTINGS_PATH);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return { ok: true, url: `${appUrl}/api/calendar/feed/${token}.ics` };
}

export async function disableIcsFeedAction(): Promise<CalendarActionResult> {
  const user = await requireUser();
  await prisma.user.update({ where: { id: user.id }, data: { icsFeedToken: null } });
  revalidatePath(SETTINGS_PATH);
  return { ok: true };
}
