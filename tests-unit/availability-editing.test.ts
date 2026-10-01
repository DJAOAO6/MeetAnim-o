import { test } from "node:test";
import assert from "node:assert/strict";
import { addSlotForMode, isDayOpenFor, openDayForMode, removeSlotForMode, setDayModeClosed, updateSlotForMode, withPracticeModeFlags } from "../src/lib/availability-editing";
import type { AvailabilitySettings, DayAvailability } from "../src/data/settings";

/**
 * Cabinet et domicile indépendants (chantier C2, phase 3) : fermer, modifier
 * ou supprimer depuis un mode ne change jamais ce que propose l'autre.
 */

const ids = () => { let n = 0; return () => `new-${++n}`; };

const tuesday: DayAvailability = {
  id: "tuesday",
  label: "Mardi",
  enabled: true,
  slots: [
    { id: "shared", start: "09:00", end: "12:00", cabinet: true, home: true },
    { id: "home-only", start: "14:00", end: "18:00", cabinet: false, home: true },
  ],
};

test("fermer le cabinet un jour laisse le domicile intact", () => {
  const day = setDayModeClosed(tuesday, "cabinet");
  assert.equal(day.enabled, true);
  assert.deepEqual(day.slots, [
    { id: "shared", start: "09:00", end: "12:00", cabinet: false, home: true },
    { id: "home-only", start: "14:00", end: "18:00", cabinet: false, home: true },
  ]);
  assert.equal(isDayOpenFor(day, "cabinet"), false);
  assert.equal(isDayOpenFor(day, "home"), true);
});

test("fermer le dernier mode ouvert ferme la journée et supprime les plages vides", () => {
  const day = setDayModeClosed(setDayModeClosed(tuesday, "cabinet"), "home");
  assert.deepEqual(day, { ...tuesday, enabled: false, slots: [] });
});

test("modifier les heures d'une plage partagée la scinde", () => {
  const day = updateSlotForMode(tuesday, "shared", "cabinet", { end: "11:00" }, ids());
  assert.deepEqual(day.slots, [
    { id: "shared", start: "09:00", end: "12:00", cabinet: false, home: true },
    { id: "new-1", start: "09:00", end: "11:00", cabinet: true, home: false },
    { id: "home-only", start: "14:00", end: "18:00", cabinet: false, home: true },
  ]);
});

test("modifier une plage d'un seul mode la change sur place", () => {
  const day = updateSlotForMode(tuesday, "home-only", "home", { start: "13:30" });
  assert.deepEqual(day.slots[1], { id: "home-only", start: "13:30", end: "18:00", cabinet: false, home: true });
  // Une plage qui n'est pas de ce mode n'est pas modifiable depuis lui.
  assert.equal(updateSlotForMode(tuesday, "home-only", "cabinet", { start: "13:30" }), tuesday);
});

test("ajouter une plage depuis un mode ne l'ouvre que pour lui", () => {
  const day = addSlotForMode(tuesday, "cabinet", "14:00", "16:00", ids());
  assert.deepEqual(day.slots.at(-1), { id: "new-1", start: "14:00", end: "16:00", cabinet: true, home: false });
});

test("supprimer une plage partagée ne retire que le mode courant", () => {
  const day = removeSlotForMode(tuesday, "shared", "home");
  assert.deepEqual(day.slots[0], { id: "shared", start: "09:00", end: "12:00", cabinet: true, home: false });
  const gone = removeSlotForMode(tuesday, "home-only", "home");
  assert.deepEqual(gone.slots.map((slot) => slot.id), ["shared"]);
});

test("rouvrir un mode reprend les heures de l'autre, ou une journée par défaut", () => {
  const reopened = openDayForMode(setDayModeClosed(tuesday, "cabinet"), "cabinet");
  assert.deepEqual(reopened.slots.map((slot) => [slot.id, slot.cabinet, slot.home]), [["shared", true, true], ["home-only", true, true]]);
  const empty: DayAvailability = { id: "sunday", label: "Dimanche", enabled: false, slots: [] };
  assert.deepEqual(openDayForMode(empty, "home", ids()), { ...empty, enabled: true, slots: [{ id: "new-1", start: "09:00", end: "18:00", cabinet: false, home: true }] });
});

test("un jour désactivé ne ressuscite pas ses anciennes plages", () => {
  const disabled: DayAvailability = { ...tuesday, enabled: false };
  assert.equal(isDayOpenFor(disabled, "home"), false);
  const day = addSlotForMode(disabled, "cabinet", "10:00", "12:00", ids());
  assert.deepEqual(day.slots, [{ id: "new-1", start: "10:00", end: "12:00", cabinet: true, home: false }]);
});

const settingsWith = (days: DayAvailability[]): AvailabilitySettings =>
  ({ days, travelBuffer: 30, breakAfterAppointment: 0, closures: [], openings: [], vacations: [], defaultAppointmentDuration: 60, slotInterval: 30 });

test("changer de façon d'exercer garde les réglages des modes toujours pratiqués (bug B5)", () => {
  const wednesdayHomeOnly: DayAvailability = { id: "wednesday", label: "Mercredi", enabled: true, slots: [{ id: "w", start: "09:00", end: "12:00", cabinet: false, home: true }] };
  // Les deux → les deux (retour sur l'étape 1) : rien ne bouge.
  const same = withPracticeModeFlags(settingsWith([tuesday, wednesdayHomeOnly]), "BOTH", "BOTH");
  assert.deepEqual(same.days, [tuesday, wednesdayHomeOnly]);
  // Les deux → domicile seul : le cabinet disparaît, le domicile reste tel quel.
  const homeOnly = withPracticeModeFlags(settingsWith([tuesday, wednesdayHomeOnly]), "BOTH", "HOME_ONLY");
  assert.deepEqual(homeOnly.days[0].slots.map((slot) => [slot.cabinet, slot.home]), [[false, true], [false, true]]);
  assert.deepEqual(homeOnly.days[1], wednesdayHomeOnly);
});

test("un mode nouvellement pratiqué est ajouté aux plages ; une plage sans mode disparaît", () => {
  const cabinetOnly: DayAvailability = { id: "monday", label: "Lundi", enabled: true, slots: [{ id: "m", start: "09:00", end: "12:00", cabinet: true, home: false }] };
  const both = withPracticeModeFlags(settingsWith([cabinetOnly]), "OFFICE_ONLY", "BOTH");
  assert.deepEqual(both.days[0].slots[0], { id: "m", start: "09:00", end: "12:00", cabinet: true, home: true });
  const homeOnly = withPracticeModeFlags(settingsWith([cabinetOnly]), "BOTH", "HOME_ONLY");
  assert.deepEqual(homeOnly.days[0], { ...cabinetOnly, enabled: false, slots: [] });
});
