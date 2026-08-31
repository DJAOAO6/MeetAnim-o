import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/dal";
import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { encryptCalendarToken } from "@/lib/calendar/calendar-encryption";
import { googleCalendarProvider } from "@/lib/calendar/google-calendar-provider";
import { verifyAndConsumeOAuthState } from "@/lib/calendar/google-oauth-state";

/**
 * Retour du consentement OAuth Google (étape 4). Toutes les erreurs
 * redirigent vers Paramètres → Intégrations avec un code lisible par l'onglet
 * (jamais une page d'erreur brute) — voir integrations-settings-tab.tsx.
 */
export async function GET(request: Request) {
  const user = await requireUser();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const settingsPath = "/dashboard/parametres?tab=integrations";

  function redirectWith(query: string) {
    return NextResponse.redirect(`${appUrl}${settingsPath}&${query}`);
  }

  const url = new URL(request.url);
  const errorParam = url.searchParams.get("error");
  if (errorParam) return redirectWith(`google_error=${encodeURIComponent(errorParam)}`);

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return redirectWith("google_error=missing_params");

  const stateIsValid = await verifyAndConsumeOAuthState(user.id, state);
  if (!stateIsValid) return redirectWith("google_error=invalid_state");

  try {
    const redirectUri = `${appUrl}/api/calendar/google/callback`;
    const tokens = await googleCalendarProvider.exchangeCodeForTokens(code, redirectUri);
    if (!tokens.refreshToken) return redirectWith("google_error=no_refresh_token");

    const calendars = await googleCalendarProvider.listCalendars(tokens.accessToken);
    const primaryCalendar = calendars.find((calendar) => calendar.primary) ?? calendars[0];

    await prisma.calendarConnection.upsert({
      where: { userId_provider: { userId: user.id, provider: "GOOGLE" } },
      create: {
        userId: user.id,
        provider: "GOOGLE",
        providerAccountId: tokens.providerAccountId,
        accountEmail: tokens.accountEmail,
        calendarId: primaryCalendar?.id ?? "primary",
        calendarName: primaryCalendar?.name ?? "Agenda principal",
        accessTokenEncrypted: encryptCalendarToken(tokens.accessToken),
        refreshTokenEncrypted: encryptCalendarToken(tokens.refreshToken),
        accessTokenExpiresAt: tokens.accessTokenExpiresAt,
      },
      // La reconnexion (jeton expiré, autorisation révoquée) ne doit pas
      // réinitialiser l'agenda déjà choisi par le professionnel —
      // calendarId/calendarName volontairement absents de cette branche.
      update: {
        providerAccountId: tokens.providerAccountId,
        accountEmail: tokens.accountEmail,
        accessTokenEncrypted: encryptCalendarToken(tokens.accessToken),
        refreshTokenEncrypted: encryptCalendarToken(tokens.refreshToken),
        accessTokenExpiresAt: tokens.accessTokenExpiresAt,
        lastError: null,
      },
    });

    await logAudit({ userId: user.id, action: "CALENDAR_CONNECTED", entityType: "CalendarConnection", metadata: { provider: "GOOGLE", accountEmail: tokens.accountEmail } });

    return redirectWith("connected=google");
  } catch (error) {
    // Jamais le contenu de l'erreur dans l'URL de redirection (pourrait
    // contenir des détails techniques) — seulement journalisé côté serveur.
    console.error("[google-oauth-callback] échec :", error instanceof Error ? error.message : error);
    return redirectWith("google_error=exchange_failed");
  }
}
