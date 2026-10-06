/**
 * Demandes à plusieurs horaires (chantier C8) : règles pures, partagées par
 * la page publique et le serveur. Le client propose jusqu'à 3 horaires, par
 * ordre de préférence ; le professionnel en retient un.
 */

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
