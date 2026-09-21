/**
 * Heure de Paris, indépendamment du fuseau du serveur.
 *
 * Les rendez-vous sont saisis en heure murale française (« le 24 à
 * 14 h 00 »), alors que le conteneur de production tourne en UTC. Tout
 * calcul d'écart (« dans 24 heures ») doit donc passer par l'instant réel,
 * changements d'heure compris.
 */
export const PARIS_TIME_ZONE = "Europe/Paris";

/** Décalage de Paris par rapport à UTC à un instant donné, en millisecondes. */
function parisOffsetMs(instant: number): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: PARIS_TIME_ZONE, hourCycle: "h23",
      year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
    }).formatToParts(new Date(instant)).map((part) => [part.type, part.value]),
  );
  const wallClock = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
  return wallClock - instant;
}

/**
 * Instant réel d'une heure murale parisienne : `("2026-09-24", "14:00")` →
 * 12:00 UTC en été, 13:00 UTC en hiver. Deux passes, pour qu'un horaire
 * proche d'un changement d'heure prenne le décalage du bon côté.
 */
export function parisWallTimeToDate(dateId: string, time: string): Date {
  const [year, month, day] = dateId.split("-").map(Number);
  const [hours, minutes] = time.split(":").map(Number);
  const asIfUtc = Date.UTC(year, month - 1, day, hours, minutes);
  const firstGuess = asIfUtc - parisOffsetMs(asIfUtc);
  return new Date(asIfUtc - parisOffsetMs(firstGuess));
}

/** Identifiant de jour (YYYY-MM-DD) à Paris, `days` jours après `now`. */
export function parisDateId(now: Date = new Date(), days = 0): string {
  const shifted = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: PARIS_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(shifted);
}
