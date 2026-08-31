import "server-only";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/dal";
import { getFreshAccessToken, getUserCalendarConnection, providerFor } from "@/lib/calendar/calendar-connections";
import type { CalendarListEntry } from "@/lib/calendar/types";

/**
 * Lectures pour Paramètres → Intégrations — écritures dans
 * calendar-actions.ts, même répartition que tours.ts/tours-actions.ts.
 */

export type GoogleIntegrationState =
  | { status: "disconnected" }
  | {
      status: "connected";
      accountEmail: string;
      calendarId: string;
      calendarName: string;
      availableCalendars: CalendarListEntry[];
      syncAppointments: boolean;
      syncUpdates: boolean;
      deleteCancelledEvents: boolean;
      blockExternalBusySlots: boolean;
      connectedAt: string;
      lastSyncAt: string | null;
      lastError: string | null;
    };

export async function getGoogleIntegrationState(): Promise<GoogleIntegrationState> {
  const user = await getCurrentUser();
  if (!user) return { status: "disconnected" };

  const connection = await getUserCalendarConnection(user.id, "GOOGLE");
  if (!connection) return { status: "disconnected" };

  // Best-effort : si Google est temporairement indisponible ou le jeton en
  // cours de reconnexion, l'agenda déjà sélectionné reste utilisable, la
  // liste de choix est simplement vide plutôt que de faire échouer la page.
  let availableCalendars: CalendarListEntry[] = [];
  try {
    const accessToken = await getFreshAccessToken(connection);
    availableCalendars = await providerFor("GOOGLE").listCalendars(accessToken);
  } catch {
    availableCalendars = [];
  }

  return {
    status: "connected",
    accountEmail: connection.accountEmail,
    calendarId: connection.calendarId,
    calendarName: connection.calendarName,
    availableCalendars,
    syncAppointments: connection.syncAppointments,
    syncUpdates: connection.syncUpdates,
    deleteCancelledEvents: connection.deleteCancelledEvents,
    blockExternalBusySlots: connection.blockExternalBusySlots,
    connectedAt: connection.connectedAt.toISOString(),
    lastSyncAt: connection.lastSyncAt?.toISOString() ?? null,
    lastError: connection.lastError,
  };
}

export type IcsFeedState = { enabled: boolean; url: string | null };

export async function getIcsFeedState(): Promise<IcsFeedState> {
  const user = await getCurrentUser();
  if (!user) return { enabled: false, url: null };

  const row = await prisma.user.findUnique({ where: { id: user.id }, select: { icsFeedToken: true } });
  if (!row?.icsFeedToken) return { enabled: false, url: null };

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return { enabled: true, url: `${appUrl}/api/calendar/feed/${row.icsFeedToken}.ics` };
}
