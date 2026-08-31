import "server-only";
import { prisma } from "@/lib/db";
import { decryptCalendarToken, encryptCalendarToken } from "@/lib/calendar/calendar-encryption";
import { googleCalendarProvider } from "@/lib/calendar/google-calendar-provider";
import { CalendarAuthError, type CalendarProvider } from "@/lib/calendar/types";
import type { CalendarConnection as DbCalendarConnection, CalendarProviderKind } from "@/generated/prisma/client";

/**
 * Registre des providers implémentés — voir CalendarProvider (types.ts).
 * MICROSOFT/APPLE restent `null` : le type CalendarProviderKind les prévoit
 * déjà (étape 20 du chantier calendrier), mais aucune connexion OAuth réelle
 * ne peut encore être établie pour eux. APPLE n'aura d'ailleurs jamais de
 * provider OAuth ici : son intégration passe par l'abonnement ICS (voir
 * src/app/api/calendar/feed), pas par CalendarConnection.
 */
const providerRegistry: Partial<Record<CalendarProviderKind, CalendarProvider>> = {
  GOOGLE: googleCalendarProvider,
};

export function providerFor(kind: CalendarProviderKind): CalendarProvider {
  const provider = providerRegistry[kind];
  if (!provider) throw new Error(`Le provider ${kind} n'est pas encore implémenté.`);
  return provider;
}

// Marge de sécurité avant l'expiration réelle : rafraîchit un peu en avance
// plutôt que d'attendre un 401 en plein appel utile.
const REFRESH_MARGIN_MS = 2 * 60 * 1000;

/**
 * Renvoie un access token garanti valide pour cette connexion, en le
 * rafraîchissant et en le persistant (chiffré) si besoin. Lève
 * CalendarAuthError si le refresh token est révoqué côté provider —
 * l'appelant doit alors proposer la reconnexion, jamais réessayer en boucle.
 */
export async function getFreshAccessToken(connection: DbCalendarConnection): Promise<string> {
  const expiresInMs = connection.accessTokenExpiresAt.getTime() - Date.now();
  if (expiresInMs > REFRESH_MARGIN_MS) {
    return decryptCalendarToken(connection.accessTokenEncrypted);
  }

  const provider = providerFor(connection.provider);
  const refreshToken = decryptCalendarToken(connection.refreshTokenEncrypted);
  try {
    const refreshed = await provider.refreshAccessToken(refreshToken);
    await prisma.calendarConnection.update({
      where: { id: connection.id },
      data: { accessTokenEncrypted: encryptCalendarToken(refreshed.accessToken), accessTokenExpiresAt: refreshed.accessTokenExpiresAt, lastError: null },
    });
    return refreshed.accessToken;
  } catch (error) {
    if (error instanceof CalendarAuthError) {
      await prisma.calendarConnection.update({ where: { id: connection.id }, data: { lastError: error.message } });
    }
    throw error;
  }
}

export function getUserCalendarConnection(userId: string, provider: CalendarProviderKind) {
  return prisma.calendarConnection.findUnique({ where: { userId_provider: { userId, provider } } });
}

/** Toutes les connexions actives pour un provider donné, tous utilisateurs confondus — utilisé par calendar-sync.ts pour diffuser un rendez-vous à qui l'a activé. */
export function getActiveConnectionsForProvider(provider: CalendarProviderKind) {
  return prisma.calendarConnection.findMany({ where: { provider, syncAppointments: true } });
}
