import { z } from "zod";
import type { PublicService, PublicZone } from "@/data/public-booking";
import type { HourAvailability } from "@/lib/availability";

/**
 * Logique pure de validation et de tarification de la réservation publique.
 * Volontairement séparée de src/lib/appointments-actions.ts ("use server") :
 * un fichier "use server" ne peut exporter que des fonctions async
 * (contrainte Next.js/React Server Functions), ce qui interdirait d'exporter
 * ces fonctions synchrones pures directement testables.
 */

const dateIdPattern = /^\d{4}-\d{2}-\d{2}$/;
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

export const publicBookingCoreSchema = z.object({
  serviceId: z.string().trim().min(1).max(200),
  date: z.string().regex(dateIdPattern, "Date invalide"),
  start: z.string().regex(timePattern, "Horaire invalide"),
  mode: z.enum(["cabinet", "home"]),
  location: z.string().trim().max(500).optional().default(""),
  notes: z.string().trim().max(2000).optional().default(""),
  clientName: z.string().trim().min(1).max(400),
  animalName: z.string().trim().min(1).max(200),
});

export type PublicBookingCore = z.infer<typeof publicBookingCoreSchema>;

/**
 * Une date de réservation n'est acceptable que si elle n'est pas déjà
 * passée et reste dans la fenêtre de réservation ouverte. Comparaison en
 * chaînes "YYYY-MM-DD" : l'ordre lexicographique correspond à l'ordre
 * chronologique pour ce format, pas besoin de reconstruire des objets Date.
 */
export function isBookingDateAcceptable(dateId: string, todayId: string, limitId: string): boolean {
  return dateId >= todayId && dateId <= limitId;
}

export function findServiceById(services: PublicService[], serviceId: string): PublicService | undefined {
  return services.find((service) => service.id === serviceId);
}

export function isModeAvailableForService(service: PublicService, mode: "cabinet" | "home"): boolean {
  return mode === "cabinet" ? service.cabinetEnabled : service.homeEnabled;
}

export function computeConsultationPrice(service: PublicService, mode: "cabinet" | "home"): number {
  return mode === "cabinet" ? service.cabinetPrice : service.homePrice;
}

function normalizeLocationText(value: string): string {
  return value.trim().toLocaleLowerCase("fr-FR").normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[’']/g, "'");
}

/**
 * Retrouve la zone correspondant à une ville/code postal, indépendamment de
 * ce que le client prétend. Mêmes règles que findMatchingZone côté client
 * (src/components/booking/details-step.tsx) : ville normalisée ou code
 * postal à 5 chiffres présent dans la liste de la zone.
 */
export function findMatchingZone(zones: PublicZone[], postalCode: string | undefined, city: string | undefined): PublicZone | undefined {
  const normalizedCity = city ? normalizeLocationText(city) : "";
  const normalizedPostalCode = (postalCode ?? "").replace(/\s/g, "");
  if (!normalizedCity && normalizedPostalCode.length !== 5) return undefined;

  return zones.find((zone) =>
    (normalizedCity.length > 0 && zone.cities.some((cityName) => normalizeLocationText(cityName) === normalizedCity))
    || (normalizedPostalCode.length === 5 && zone.postalCodes.includes(normalizedPostalCode)),
  );
}

export function computeTravelFee(service: PublicService, mode: "cabinet" | "home", zones: PublicZone[], postalCode: string | undefined, city: string | undefined): number {
  if (mode !== "home") return 0;
  if (service.travelFeeMode === "fixed") return service.fixedTravelFee;
  if (service.travelFeeMode === "zone") {
    const zone = findMatchingZone(zones, postalCode, city);
    return zone ? service.zoneFees[zone.name] ?? 0 : 0;
  }
  return 0;
}

export function computeTotalPrice(service: PublicService, mode: "cabinet" | "home", zones: PublicZone[], postalCode: string | undefined, city: string | undefined): number {
  return computeConsultationPrice(service, mode) + computeTravelFee(service, mode, zones, postalCode, city);
}

/**
 * Conversions et comparaison d'intervalles horaires, partagées entre la
 * détection de conflit côté serveur (hasConflict) et le filtrage des
 * créneaux affichés côté client (schedule-step.tsx) : les deux doivent
 * appliquer exactement la même règle de recouvrement, pas juste l'égalité
 * stricte d'un horaire de départ.
 */
export function timeToMinutes(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

export function minutesToTime(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/**
 * Deux intervalles [startA, startA+durationA) et [startB, startB+durationB)
 * se recouvrent dès que l'un commence avant que l'autre ne se termine, dans
 * les deux sens — condition standard de recouvrement d'intervalles.
 */
export function intervalsOverlap(startA: number, durationA: number, startB: number, durationB: number): boolean {
  return startA < startB + durationB && startB < startA + durationA;
}

/**
 * Piège anti-bot discret : un envoi plus rapide que le temps humain minimum
 * plausible pour remplir le tunnel est très probablement automatisé. Le
 * timestamp de départ vient du client (mount du tunnel) : ce n'est pas une
 * preuve cryptographique, seulement un signal supplémentaire à combiner avec
 * le rate limiting, pas une défense à lui seul.
 */
export const MIN_FORM_FILL_MS = 3000;

export function passesMinimumFillTime(startedAt: number | undefined, now: number): boolean {
  if (startedAt === undefined || !Number.isFinite(startedAt)) return false;
  return now - startedAt >= MIN_FORM_FILL_MS;
}

/**
 * Fuseau du praticien (seul aujourd'hui, cabinet en France) : sert
 * uniquement à déterminer "quel jour sommes-nous" pour l'ouverture de la
 * fenêtre de réservation, indépendamment du fuseau du serveur d'exécution
 * ou du navigateur du visiteur. Tout le reste (arithmétique de calendrier,
 * lecture de getDayAvailability) reste ensuite en accesseurs Date locaux
 * "au midi" — un intervalle sûr pour tout fuseau réel (aucun n'a un
 * décalage ≥ 12h), donc cohérent quel que soit l'environnement d'exécution.
 */
export const PRACTITIONER_TIME_ZONE = "Europe/Paris";

export function todayIdInTimeZone(timeZone: string, now: Date = new Date()): string {
  // Le calendrier "en-CA" formate nativement en YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/**
 * Reconstruit un objet Date "au midi local" à partir d'un identifiant
 * YYYY-MM-DD, pour ensuite l'utiliser avec des accesseurs locaux
 * (getDay/getDate/...) sans risque de bascule de jour lié au fuseau
 * d'exécution ou à un changement d'heure.
 */
export function parseDateIdToLocalNoon(dateId: string): Date {
  const [year, month, day] = dateId.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

export function toLocalDateId(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function capitalizeFrench(value: string): string {
  return value.charAt(0).toLocaleUpperCase("fr-FR") + value.slice(1);
}

const weekdayFormatter = new Intl.DateTimeFormat("fr-FR", { weekday: "long" });
const shortDateFormatter = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });
const fullDateFormatter = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

/**
 * Formatage français d'un identifiant de date, indépendant de toute liste
 * générée à l'avance — utilisé aussi bien pour construire les créneaux
 * proposés (src/lib/public-schedule.ts) que pour ré-afficher une date déjà
 * choisie (résumé, écran de succès) sans dépendre d'une recherche dans une
 * liste qui pourrait ne plus la contenir.
 */
export function formatBookingDateLabels(dateId: string): { weekday: string; shortLabel: string; fullLabel: string } {
  const date = parseDateIdToLocalNoon(dateId);
  return {
    weekday: capitalizeFrench(weekdayFormatter.format(date)),
    shortLabel: shortDateFormatter.format(date),
    fullLabel: capitalizeFrench(fullDateFormatter.format(date)),
  };
}

/**
 * Un rendez-vous [startMinutes, startMinutes+durationMinutes) ne tient dans
 * les disponibilités horaires (getDayAvailability) que si CHAQUE heure
 * qu'il touche est ouverte pour le mode demandé — pas seulement son heure
 * de départ. Par exemple 09:30 pendant 60 min touche l'heure 9 ET l'heure
 * 10.
 */
export function fitsWithinOpenHours(hourly: Record<number, HourAvailability> | null, mode: "cabinet" | "home", startMinutes: number, durationMinutes: number): boolean {
  if (!hourly) return false;
  const endMinutes = startMinutes + durationMinutes;
  if (endMinutes > 24 * 60) return false;

  const firstHour = Math.floor(startMinutes / 60);
  const lastHour = Math.floor((endMinutes - 1) / 60);
  for (let hour = firstHour; hour <= lastHour; hour++) {
    const hourInfo = hourly[hour];
    if (!hourInfo || (mode === "cabinet" ? !hourInfo.cabinet : !hourInfo.home)) return false;
  }
  return true;
}

/**
 * Répartit des horaires de départ ("HH:MM") en Matin / Après-midi pour
 * l'affichage du calendrier (src/components/booking/schedule-step.tsx) :
 * bascule à midi, pas de groupe Soir distinct (les horaires du soir
 * restent dans Après-midi — demande explicite, la distinction n'apportait
 * rien pour ce cabinet). Un groupe vide est simplement un tableau vide — à
 * l'appelant de ne pas afficher son titre plutôt que de le laisser orphelin.
 */
export function groupSlotsByPeriod(slots: string[]): { morning: string[]; afternoon: string[] } {
  const morning: string[] = [];
  const afternoon: string[] = [];
  for (const slot of slots) {
    if (timeToMinutes(slot) < 12 * 60) morning.push(slot);
    else afternoon.push(slot);
  }
  return { morning, afternoon };
}

/**
 * Décale un identifiant de mois "YYYY-MM" de `delta` mois (positif ou
 * négatif), en passant par un objet Date pour que le report d'année soit
 * géré par le moteur JS plutôt que recalculé à la main.
 */
export function addMonths(monthId: string, delta: number): string {
  const [year, month] = monthId.split("-").map(Number);
  const date = new Date(year, month - 1 + delta, 1, 12);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Liste tous les identifiants de date ("YYYY-MM-DD") d'un mois calendaire
 * complet, avec le nombre de cellules vides à laisser avant le 1er pour
 * aligner les jours sur la bonne colonne d'une grille semaine-lundi-first
 * (LUN MAR MER JEU VEN SAM DIM). Le calendrier a besoin de tous les jours du
 * mois, pas seulement de ceux qui ont des créneaux — voir
 * PROMPT-CALENDRIER.md §A2.
 */
export function getMonthGridDays(monthId: string): { leadingBlanks: number; dateIds: string[] } {
  const [year, month] = monthId.split("-").map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const firstWeekday = (new Date(year, month - 1, 1).getDay() + 6) % 7;
  const dateIds = Array.from({ length: daysInMonth }, (_, index) => {
    const day = index + 1;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  });
  return { leadingBlanks: firstWeekday, dateIds };
}

export const SLOT_GRANULARITY_MINUTES = 30;

/**
 * Fenêtre glissante de réservation : le lendemain (aucune réservation le
 * jour même) jusqu'à 90 jours plus tard — voir src/lib/public-schedule.ts.
 * Définie ici plutôt que dans ce fichier "use server" : un fichier "use
 * server" ne peut exporter que des fonctions async, pas une constante.
 */
export const BOOKING_WINDOW_DAYS = 90;

/**
 * Génère les horaires de départ candidats (par pas de `slotIntervalMinutes`,
 * réglable par le praticien dans Paramètres > Disponibilités — sinon
 * SLOT_GRANULARITY_MINUTES par défaut) qui tiennent entièrement dans les
 * disponibilités réelles pour le mode et la durée demandés.
 */
export function generateCandidateStarts(hourly: Record<number, HourAvailability> | null, mode: "cabinet" | "home", durationMinutes: number, slotIntervalMinutes: number = SLOT_GRANULARITY_MINUTES): string[] {
  const starts: string[] = [];
  for (let minutes = 0; minutes < 24 * 60; minutes += slotIntervalMinutes) {
    if (fitsWithinOpenHours(hourly, mode, minutes, durationMinutes)) starts.push(minutesToTime(minutes));
  }
  return starts;
}

/**
 * Référence courte et lisible dérivée de l'identifiant réel (cuid, pas
 * pensé pour être lu/dicté) — purement cosmétique, l'identifiant complet
 * reste la clé stockée en base. Partagée entre l'email de confirmation
 * (appointments-actions.ts) et l'écran de succès (summary-steps.tsx) pour
 * qu'un client puisse relier les deux.
 */
export function formatBookingReference(id: string): string {
  return id.slice(-8).toUpperCase();
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * Échappe une valeur texte pour un champ .ics (RFC 5545 §3.3.11) :
 * antislash, virgule, point-virgule et retour à la ligne sont des
 * caractères spéciaux du format qui casseraient le fichier s'ils
 * apparaissaient tels quels (ex. une adresse contenant une virgule).
 */
function escapeIcsText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/;/g, "\\;").replace(/\n/g, "\\n");
}

export type IcsEventInput = {
  uid: string;
  dateId: string;
  start: string;
  durationMinutes: number;
  summary: string;
  description: string;
  location: string;
};

/**
 * Construit un fichier .ics minimal (un seul VEVENT) pour le bouton
 * "Ajouter à mon calendrier" de l'écran de succès (BookingSuccess). DTSTART/
 * DTEND sont en heure "flottante" (sans suffixe Z ni TZID) plutôt qu'en UTC
 * précis : convertir correctement Europe/Paris (praticien) vers UTC exige de
 * gérer les changements d'heure été/hiver, hors de portée pour ce gain
 * ponctuel — une heure flottante est interprétée par la plupart des
 * calendriers dans le fuseau local du lecteur, ce qui coïncide avec celui du
 * praticien pour l'immense majorité de ses clients (patientèle locale).
 * DTSTAMP (horodatage de génération du fichier, sémantiquement différent de
 * DTSTART) reste en UTC réel comme l'exige RFC 5545.
 */
export function buildIcsContent(input: IcsEventInput, now: Date = new Date()): string {
  const [year, month, day] = input.dateId.split("-").map(Number);
  const [startHour, startMinute] = input.start.split(":").map(Number);
  const startDate = new Date(year, month - 1, day, startHour, startMinute);
  const endDate = new Date(startDate.getTime() + input.durationMinutes * 60_000);

  const formatFloating = (date: Date) => `${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}T${pad2(date.getHours())}${pad2(date.getMinutes())}00`;
  const formatUtc = (date: Date) => `${date.getUTCFullYear()}${pad2(date.getUTCMonth() + 1)}${pad2(date.getUTCDate())}T${pad2(date.getUTCHours())}${pad2(date.getUTCMinutes())}${pad2(date.getUTCSeconds())}Z`;

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Animeo//Reservation publique//FR",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${input.uid}`,
    `DTSTAMP:${formatUtc(now)}`,
    `DTSTART:${formatFloating(startDate)}`,
    `DTEND:${formatFloating(endDate)}`,
    `SUMMARY:${escapeIcsText(input.summary)}`,
    `DESCRIPTION:${escapeIcsText(input.description)}`,
    `LOCATION:${escapeIcsText(input.location)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  // RFC 5545 impose des fins de ligne CRLF.
  return lines.join("\r\n");
}
