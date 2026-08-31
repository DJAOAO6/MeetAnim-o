import "server-only";
import { CalendarAuthError, type BusyPeriod, type CalendarEventInput, type CalendarListEntry, type CalendarProvider, type OAuthTokenResult, type RefreshedCredentials } from "@/lib/calendar/types";

/**
 * Implémentation Google Calendar de CalendarProvider — appels REST directs
 * (fetch), pas de SDK googleapis : évite une dépendance lourde pour trois
 * familles d'appels (OAuth, événements, freebusy), dans le même esprit que
 * geo-search.ts (API Découpage administratif) ailleurs dans ce projet.
 *
 * Scopes volontairement minimaux (étape 4 du chantier calendrier) :
 * - openid + email : retrouver l'adresse du compte Google connecté.
 * - calendar.events : créer/modifier/supprimer des événements.
 * - calendar.readonly : lister les agendas et interroger FreeBusy.
 */

export const GOOGLE_OAUTH_SCOPES = ["openid", "email", "https://www.googleapis.com/auth/calendar.events", "https://www.googleapis.com/auth/calendar.readonly"].join(" ");

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} n'est pas configurée — voir docs/GOOGLE-CALENDAR-SETUP.md.`);
  return value;
}

type GoogleTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
  token_type?: string;
  id_token?: string;
  error?: string;
  error_description?: string;
};

function decodeEmailFromIdToken(idToken: string): string | null {
  try {
    const payloadSegment = idToken.split(".")[1];
    const payload = JSON.parse(Buffer.from(payloadSegment, "base64url").toString("utf8")) as { email?: string };
    return payload.email ?? null;
  } catch {
    return null;
  }
}

async function googleFetch(url: string, accessToken: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(url, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
  });
  if (response.status === 401) {
    throw new CalendarAuthError("Le jeton d'accès Google a été rejeté (401) — probablement révoqué côté Google.");
  }
  return response;
}

export const googleCalendarProvider: CalendarProvider = {
  getAuthorizationUrl(state, redirectUri) {
    const params = new URLSearchParams({
      client_id: requireEnv("GOOGLE_CLIENT_ID"),
      redirect_uri: redirectUri,
      response_type: "code",
      scope: GOOGLE_OAUTH_SCOPES,
      // access_type=offline + prompt=consent : garantit un refresh token à
      // chaque connexion, même pour un compte qui avait déjà autorisé
      // l'application par le passé (Google ne renvoie sinon un refresh
      // token qu'à la toute première autorisation).
      access_type: "offline",
      prompt: "consent",
      state,
      include_granted_scopes: "true",
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  },

  async exchangeCodeForTokens(code, redirectUri): Promise<OAuthTokenResult> {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: requireEnv("GOOGLE_CLIENT_ID"),
        client_secret: requireEnv("GOOGLE_CLIENT_SECRET"),
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
    const data = (await response.json()) as GoogleTokenResponse;
    if (!response.ok || !data.access_token) {
      throw new Error(`Échange du code OAuth Google échoué : ${data.error_description ?? data.error ?? response.status}`);
    }
    if (!data.refresh_token) {
      // Peut arriver si le compte avait déjà autorisé l'application sans
      // prompt=consent (ancien état) — access_type=offline + prompt=consent
      // ci-dessus vise justement à éviter ce cas, mais on le signale
      // explicitement plutôt que de stocker un refresh token vide.
      throw new Error("Google n'a pas renvoyé de refresh token — reconnectez le compte pour forcer un nouveau consentement.");
    }

    const email = data.id_token ? decodeEmailFromIdToken(data.id_token) : null;
    if (!email) throw new Error("Impossible de retrouver l'adresse email du compte Google connecté.");

    // sub (identifiant stable du compte Google) vient du même id_token.
    const idTokenPayload = JSON.parse(Buffer.from(data.id_token!.split(".")[1], "base64url").toString("utf8")) as { sub?: string };
    if (!idTokenPayload.sub) throw new Error("Impossible de retrouver l'identifiant du compte Google connecté.");

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      accessTokenExpiresAt: new Date(Date.now() + data.expires_in * 1000),
      providerAccountId: idTokenPayload.sub,
      accountEmail: email,
    };
  },

  async refreshAccessToken(refreshToken): Promise<RefreshedCredentials> {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: requireEnv("GOOGLE_CLIENT_ID"),
        client_secret: requireEnv("GOOGLE_CLIENT_SECRET"),
        grant_type: "refresh_token",
      }),
    });
    const data = (await response.json()) as GoogleTokenResponse;
    if (response.status === 400 || response.status === 401) {
      // invalid_grant : le refresh token a été révoqué (déconnexion côté
      // Google, mot de passe changé, application retirée) — distinct d'une
      // panne réseau, la reconnexion doit être proposée plutôt que réessayée.
      throw new CalendarAuthError(`Rafraîchissement du jeton Google refusé : ${data.error_description ?? data.error ?? "invalid_grant"}`);
    }
    if (!response.ok || !data.access_token) {
      throw new Error(`Rafraîchissement du jeton Google échoué : ${data.error_description ?? data.error ?? response.status}`);
    }
    return { accessToken: data.access_token, accessTokenExpiresAt: new Date(Date.now() + data.expires_in * 1000) };
  },

  async listCalendars(accessToken): Promise<CalendarListEntry[]> {
    const response = await googleFetch("https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=writer", accessToken);
    if (!response.ok) throw new Error(`Liste des agendas Google indisponible (${response.status}).`);
    const data = (await response.json()) as { items?: Array<{ id: string; summary: string; primary?: boolean }> };
    return (data.items ?? []).map((item) => ({ id: item.id, name: item.summary, primary: Boolean(item.primary) }));
  },

  async createEvent(accessToken, calendarId, event): Promise<string> {
    const response = await googleFetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`, accessToken, {
      method: "POST",
      body: JSON.stringify(toGoogleEventBody(event)),
    });
    if (!response.ok) throw new Error(`Création de l'événement Google échouée (${response.status}).`);
    const data = (await response.json()) as { id: string };
    return data.id;
  },

  async updateEvent(accessToken, calendarId, externalEventId, event): Promise<void> {
    const response = await googleFetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(externalEventId)}`,
      accessToken,
      { method: "PATCH", body: JSON.stringify(toGoogleEventBody(event)) },
    );
    // 404/410 : l'événement a été supprimé manuellement côté Google entre
    // temps — pas une erreur à faire remonter, rien à mettre à jour.
    if (response.status === 404 || response.status === 410) return;
    if (!response.ok) throw new Error(`Mise à jour de l'événement Google échouée (${response.status}).`);
  },

  async deleteEvent(accessToken, calendarId, externalEventId): Promise<void> {
    const response = await googleFetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(externalEventId)}`,
      accessToken,
      { method: "DELETE" },
    );
    // 404/410 : déjà absent côté Google, l'objectif ("ne plus y être") est
    // déjà atteint — ne jamais lever pour ce cas (voir CalendarProvider).
    if (response.status === 404 || response.status === 410 || response.status === 204 || response.ok) return;
    throw new Error(`Suppression de l'événement Google échouée (${response.status}).`);
  },

  async getBusyPeriods(accessToken, calendarId, fromIso, toIso): Promise<BusyPeriod[]> {
    const response = await googleFetch("https://www.googleapis.com/calendar/v3/freeBusy", accessToken, {
      method: "POST",
      body: JSON.stringify({ timeMin: fromIso, timeMax: toIso, items: [{ id: calendarId }] }),
    });
    if (!response.ok) throw new Error(`Interrogation FreeBusy Google échouée (${response.status}).`);
    const data = (await response.json()) as { calendars?: Record<string, { busy?: Array<{ start: string; end: string }>; errors?: unknown[] }> };
    const busy = data.calendars?.[calendarId]?.busy ?? [];
    return busy.map((period) => ({ startIso: period.start, endIso: period.end }));
  },
};

function toGoogleEventBody(event: CalendarEventInput) {
  return {
    summary: event.summary,
    description: event.description,
    location: event.location || undefined,
    start: { dateTime: event.startIso, timeZone: event.timeZone },
    end: { dateTime: event.endIso, timeZone: event.timeZone },
  };
}
