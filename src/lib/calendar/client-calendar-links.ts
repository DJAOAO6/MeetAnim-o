/**
 * Liens "Ajouter à mon agenda" pour le CLIENT après réservation (étapes
 * 13-16 du chantier calendrier) — jamais d'OAuth ici : Google et Outlook
 * exposent chacun une URL pré-remplie que le client valide lui-même dans
 * son propre compte, sans jamais connecter quoi que ce soit à ce logiciel.
 * Pas de "server-only" : utilisé depuis un composant client
 * (summary-steps.tsx), aucune donnée sensible manipulée.
 */

export type CalendarLinkInput = {
  title: string;
  description: string;
  location: string;
  dateId: string;
  start: string;
  durationMinutes: number;
};

/** "+02:00" / "+01:00" selon la date (heure d'été/hiver) — Europe/Paris uniquement, seul fuseau pertinent pour ce cabinet. */
function resolveParisOffset(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Paris", timeZoneName: "shortOffset" }).formatToParts(date);
  const offsetPart = parts.find((part) => part.type === "timeZoneName")?.value ?? "GMT+1";
  const match = offsetPart.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  if (!match) return "+01:00";
  const [, sign, rawHours, rawMinutes] = match;
  return `${sign}${rawHours.padStart(2, "0")}:${(rawMinutes ?? "00").padStart(2, "0")}`;
}

function toParisIso(dateId: string, time: string): string {
  const [year, month, day] = dateId.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const localDate = new Date(year, month - 1, day, hour, minute);
  return `${dateId}T${time}:00${resolveParisOffset(localDate)}`;
}

function addMinutes(dateId: string, time: string, minutes: number): { dateId: string; time: string } {
  const [year, month, day] = dateId.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const date = new Date(year, month - 1, day, hour, minute + minutes);
  const nextDateId = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const nextTime = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  return { dateId: nextDateId, time: nextTime };
}

function toGoogleCompact(dateId: string, time: string): string {
  return `${dateId.replace(/-/g, "")}T${time.replace(":", "")}00`;
}

export function buildGoogleCalendarLink(input: CalendarLinkInput): string {
  const end = addMinutes(input.dateId, input.start, input.durationMinutes);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: input.title,
    dates: `${toGoogleCompact(input.dateId, input.start)}/${toGoogleCompact(end.dateId, end.time)}`,
    details: input.description,
    location: input.location,
    ctz: "Europe/Paris",
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function buildOutlookCalendarLink(input: CalendarLinkInput): string {
  const end = addMinutes(input.dateId, input.start, input.durationMinutes);
  const params = new URLSearchParams({
    path: "/calendar/action/compose",
    rru: "addevent",
    startdt: toParisIso(input.dateId, input.start),
    enddt: toParisIso(end.dateId, end.time),
    subject: input.title,
    body: input.description,
    location: input.location,
  });
  return `https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`;
}
