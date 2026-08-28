import { z } from "zod";
import type { PublicService, PublicZone } from "@/data/public-booking";

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
  if (service.travelFeeMode === "zone") return findMatchingZone(zones, postalCode, city)?.travelFee ?? 0;
  return 0;
}

export function computeTotalPrice(service: PublicService, mode: "cabinet" | "home", zones: PublicZone[], postalCode: string | undefined, city: string | undefined): number {
  return computeConsultationPrice(service, mode) + computeTravelFee(service, mode, zones, postalCode, city);
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
