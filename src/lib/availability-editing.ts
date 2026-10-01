import type { AvailabilitySettings, DayAvailability, TimeSlot } from "@/data/settings";
import { hasCabinet, visitsHomes, type PracticeMode } from "@/lib/practice-mode";

/**
 * Édition des horaires habituels d'un mode sans toucher à l'autre.
 *
 * Une plage peut servir au cabinet et au domicile à la fois. Modifier,
 * supprimer ou fermer depuis un mode ne doit jamais changer ce que l'autre
 * propose : la plage partagée est scindée, ou perd seulement le drapeau du
 * mode courant. Une plage qui ne sert plus à aucun mode disparaît, et un jour
 * sans plage est fermé.
 *
 * Un jour désactivé est fermé pour les deux modes : ses anciennes plages ne
 * reviennent pas quand on rouvre un seul mode.
 */

export type SlotMode = "cabinet" | "home";

type SlotTimes = { start?: string; end?: string };

function otherMode(mode: SlotMode): SlotMode {
  return mode === "cabinet" ? "home" : "cabinet";
}

function defaultSlotId(): string {
  return `slot-${Date.now()}-${Math.round(Math.random() * 1000)}`;
}

function liveSlots(day: DayAvailability): TimeSlot[] {
  return day.enabled ? day.slots : [];
}

function withSlots(day: DayAvailability, slots: TimeSlot[]): DayAvailability {
  const kept = slots.filter((slot) => slot.cabinet || slot.home);
  return { ...day, enabled: kept.length > 0, slots: kept };
}

/** Le mode est-il ouvert ce jour-là ? */
export function isDayOpenFor(day: DayAvailability, mode: SlotMode): boolean {
  return liveSlots(day).some((slot) => slot[mode]);
}

/** Ferme le jour pour ce mode seulement : l'autre garde ses plages. */
export function setDayModeClosed(day: DayAvailability, mode: SlotMode): DayAvailability {
  return withSlots(day, liveSlots(day).map((slot) => ({ ...slot, [mode]: false })));
}

/**
 * Rouvre le jour pour ce mode : sur les plages de l'autre mode s'il y en a
 * (un point de départ, modifiable ensuite), sinon sur une plage par défaut.
 */
export function openDayForMode(day: DayAvailability, mode: SlotMode, makeId: () => string = defaultSlotId): DayAvailability {
  const slots = liveSlots(day);
  if (slots.length === 0) return addSlotForMode(day, mode, "09:00", "18:00", makeId);
  return withSlots(day, slots.map((slot) => ({ ...slot, [mode]: true })));
}

/** Nouvelle plage pour ce mode seulement. */
export function addSlotForMode(day: DayAvailability, mode: SlotMode, start = "09:00", end = "12:00", makeId: () => string = defaultSlotId): DayAvailability {
  const slot: TimeSlot = { id: makeId(), start, end, cabinet: mode === "cabinet", home: mode === "home" };
  return withSlots(day, [...liveSlots(day), slot]);
}

/**
 * Nouvelles heures d'une plage, pour ce mode. Une plage partagée est scindée :
 * l'originale garde l'autre mode et ses heures, une nouvelle plage, placée
 * juste après, porte les nouvelles heures pour ce mode seul.
 */
export function updateSlotForMode(day: DayAvailability, slotId: string, mode: SlotMode, times: SlotTimes, makeId: () => string = defaultSlotId): DayAvailability {
  const slots = liveSlots(day);
  const slot = slots.find((item) => item.id === slotId);
  if (!slot || !slot[mode]) return day;
  if (!slot[otherMode(mode)]) return withSlots(day, slots.map((item) => (item.id === slotId ? { ...item, ...times } : item)));
  const split: TimeSlot = { id: makeId(), start: times.start ?? slot.start, end: times.end ?? slot.end, cabinet: mode === "cabinet", home: mode === "home" };
  return withSlots(day, slots.flatMap((item) => (item.id === slotId ? [{ ...item, [mode]: false }, split] : [item])));
}

/** Retire une plage de ce mode ; partagée, elle reste pour l'autre. */
export function removeSlotForMode(day: DayAvailability, slotId: string, mode: SlotMode): DayAvailability {
  return withSlots(day, liveSlots(day).map((item) => (item.id === slotId ? { ...item, [mode]: false } : item)));
}

/**
 * Les plages suivent un changement de façon d'exercer, sans écraser ce qui
 * était réglé : un mode qui n'est plus pratiqué disparaît des plages, un mode
 * nouvellement pratiqué y est ajouté (point de départ), un mode qui l'était
 * déjà garde ses réglages jour par jour.
 */
export function withPracticeModeFlags(availability: AvailabilitySettings, previous: PracticeMode, next: PracticeMode): AvailabilitySettings {
  const flag = (value: boolean, before: boolean, after: boolean) => (!after ? false : !before ? true : value);
  return {
    ...availability,
    days: availability.days.map((day) => {
      const slots = day.slots
        .map((slot) => ({
          ...slot,
          cabinet: flag(slot.cabinet, hasCabinet(previous), hasCabinet(next)),
          home: flag(slot.home, visitsHomes(previous), visitsHomes(next)),
        }))
        .filter((slot) => slot.cabinet || slot.home);
      return { ...day, enabled: day.enabled && slots.length > 0, slots };
    }),
  };
}
