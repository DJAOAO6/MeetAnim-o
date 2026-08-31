/**
 * Abstraction provider-agnostique (Google aujourd'hui, Microsoft plus tard
 * — voir docs/GOOGLE-CALENDAR-SETUP.md et étape 20 du chantier calendrier).
 * Le métier Appointment (appointments-actions.ts) ne parle jamais à un
 * provider directement, uniquement à calendar-sync.ts, qui passe par cette
 * interface. Aucune fonction ci-dessous ne gère elle-même le stockage des
 * jetons : l'appelant (calendar-connections.ts) fournit un access token déjà
 * valide/rafraîchi.
 */

export type CalendarEventInput = {
  summary: string;
  description: string;
  location: string;
  /** ISO 8601 avec décalage (ex. 2026-09-08T14:00:00+02:00). */
  startIso: string;
  endIso: string;
  timeZone: string;
};

export type CalendarListEntry = {
  id: string;
  name: string;
  primary: boolean;
};

export type BusyPeriod = {
  startIso: string;
  endIso: string;
};

export type OAuthTokenResult = {
  accessToken: string;
  refreshToken: string | null;
  accessTokenExpiresAt: Date;
  providerAccountId: string;
  accountEmail: string;
};

export type RefreshedCredentials = {
  accessToken: string;
  accessTokenExpiresAt: Date;
};

export interface CalendarProvider {
  /** URL vers laquelle rediriger le professionnel pour lancer le consentement OAuth. */
  getAuthorizationUrl(state: string, redirectUri: string): string;
  /** Échange le code retourné par le callback OAuth contre des jetons — jamais l'email seul ne détermine l'utilisateur local, voir la route de callback. */
  exchangeCodeForTokens(code: string, redirectUri: string): Promise<OAuthTokenResult>;
  refreshAccessToken(refreshToken: string): Promise<RefreshedCredentials>;
  listCalendars(accessToken: string): Promise<CalendarListEntry[]>;
  /** Retourne l'identifiant externe de l'événement créé. */
  createEvent(accessToken: string, calendarId: string, event: CalendarEventInput): Promise<string>;
  updateEvent(accessToken: string, calendarId: string, externalEventId: string, event: CalendarEventInput): Promise<void>;
  /** Ne doit jamais lever si l'événement est déjà absent côté provider (supprimé manuellement) — voir l'implémentation Google. */
  deleteEvent(accessToken: string, calendarId: string, externalEventId: string): Promise<void>;
  getBusyPeriods(accessToken: string, calendarId: string, fromIso: string, toIso: string): Promise<BusyPeriod[]>;
}

/** Erreur distincte d'une panne réseau générique : le refresh token n'est plus valide, la connexion doit être proposée à la reconnexion plutôt que réessayée. */
export class CalendarAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CalendarAuthError";
  }
}
