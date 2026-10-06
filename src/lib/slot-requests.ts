/**
 * Demandes à plusieurs horaires (chantier C8) : règles pures, partagées par
 * la page publique et le serveur. Le client propose jusqu'à 3 horaires, par
 * ordre de préférence ; le professionnel en retient un.
 */

import { parisWallTimeToDate } from "@/lib/paris-time";

export const MAX_SLOT_CHOICES = 3;
export const MIN_SLOT_CHOICES = 2;

export type SlotChoice = { date: string; time: string };

function sameSlot(a: SlotChoice, b: SlotChoice): boolean {
  return a.date === b.date && a.time === b.time;
}

/**
 * Cocher ou décocher un horaire. Déjà choisi : il est retiré (les suivants
 * remontent d'un rang). Sinon ajouté à la fin, sauf au-delà de 3.
 */
export function toggleSlotChoice(choices: SlotChoice[], choice: SlotChoice): { choices: SlotChoice[]; full: boolean } {
  if (choices.some((item) => sameSlot(item, choice))) return { choices: choices.filter((item) => !sameSlot(item, choice)), full: false };
  if (choices.length >= MAX_SLOT_CHOICES) return { choices, full: true };
  return { choices: [...choices, choice], full: false };
}

/** « 1er choix », « 2e choix », « 3e choix ». */
export function choiceRankLabel(rank: number): string {
  return rank === 1 ? "1er choix" : `${rank}e choix`;
}

/** Sans réponse, une demande à plusieurs horaires expire au bout de 72 h… */
export const REQUEST_EXPIRY_MS = 72 * 60 * 60 * 1000;
/** … ou 24 h avant son premier horaire proposé, si c'est plus tôt. */
export const REQUEST_EXPIRY_BEFORE_SLOT_MS = 24 * 60 * 60 * 1000;

/**
 * Échéance d'une demande à plusieurs horaires : 72 h après sa création, ou
 * 24 h avant le plus proche de ses horaires (heure de Paris), le premier des
 * deux. Sans cela, une demande oubliée bloquerait trois créneaux
 * indéfiniment.
 */
export function requestExpiresAt(request: { createdAt: Date; slots: Array<{ date: string; start: string }> }): Date {
  const byAge = request.createdAt.getTime() + REQUEST_EXPIRY_MS;
  const earliest = Math.min(...request.slots.map((slot) => parisWallTimeToDate(slot.date, slot.start).getTime()));
  return new Date(Math.min(byAge, Number.isFinite(earliest) ? earliest - REQUEST_EXPIRY_BEFORE_SLOT_MS : byAge));
}

/** « expire dans 5 h », « expire dans 40 min » ; null au-delà de 24 h (rien d'urgent à signaler). */
export function expiryNotice(expiresAt: Date, now: Date): string | null {
  const remaining = expiresAt.getTime() - now.getTime();
  if (remaining > 24 * 60 * 60 * 1000) return null;
  if (remaining <= 0) return "expire d’un instant à l’autre";
  const minutes = Math.round(remaining / 60000);
  return minutes < 60 ? `expire dans ${Math.max(1, minutes)} min` : `expire dans ${Math.round(minutes / 60)} h`;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;

/**
 * Les horaires d'une demande reçue par le serveur : le créneau habituel, ou
 * la liste proposée (1 à 3, au bon format, sans doublon). Le premier est
 * celui du rendez-vous tant que le professionnel n'a pas choisi.
 */
export function requestedSlots(input: { date: string; start: string; slots?: Array<{ date: string; start: string }> }): Array<{ date: string; start: string }> | null {
  const slots = input.slots && input.slots.length > 0 ? input.slots : [{ date: input.date, start: input.start }];
  if (slots.length > MAX_SLOT_CHOICES) return null;
  if (slots.some((slot) => !DATE.test(slot.date) || !TIME.test(slot.start))) return null;
  const keys = new Set(slots.map((slot) => `${slot.date} ${slot.start}`));
  if (keys.size !== slots.length) return null;
  return slots.map((slot) => ({ date: slot.date, start: slot.start }));
}
