import { test } from "node:test";
import assert from "node:assert/strict";
import { computeClosedRanges, getDayAvailability, isOpenAt, mergeIntervals, subtractInterval } from "../src/lib/availability";
import { fitsWithinOpenHours, generateCandidateStarts, timeToMinutes } from "../src/lib/booking-validation";
import type { AvailabilitySettings, DayAvailability, ExceptionalClosure } from "../src/data/settings";

/**
 * Disponibilités à la minute (chantier C2, phase 1). Avant, le moteur
 * raisonnait par heure pleine : une plage qui finit à 12:30 ouvrait toute
 * l'heure 12, une fermeture de 30 min fermait l'heure entière.
 */

const MONDAY = new Date(2026, 9, 5, 12); // lundi 5 octobre 2026
const MONDAY_ID = "2026-10-05";

function settings(slots: DayAvailability["slots"], extra: Partial<AvailabilitySettings> = {}): AvailabilitySettings {
  return {
    days: [{ id: "monday", label: "Lundi", enabled: true, slots }],
    travelBuffer: 30,
    breakAfterAppointment: 0,
    closures: [],
    vacations: [],
    defaultAppointmentDuration: 60,
    slotInterval: 30,
    ...extra,
  };
}

const slot = (start: string, end: string, cabinet = true, home = true) => ({ id: `${start}-${end}`, start, end, cabinet, home });
const closure = (start: string, end: string, scope: ExceptionalClosure["scope"] = "Tout fermer", date = MONDAY_ID, endDate?: string): ExceptionalClosure =>
  ({ id: `c-${start}`, date, endDate, start, end, scope, reason: "" });
const m = timeToMinutes;

test("plage 09:30–12:30, 60 min, pas 30 : ni 09:00 ni 12:00 (cas 1 de la phase 0)", () => {
  const { intervals } = getDayAvailability(MONDAY, settings([slot("09:30", "12:30")]));
  assert.deepEqual(generateCandidateStarts(intervals, "cabinet", 60, 30), ["09:30", "10:00", "10:30", "11:00", "11:30"]);
  assert.equal(fitsWithinOpenHours(intervals, "cabinet", m("12:00"), 60), false);
  assert.equal(fitsWithinOpenHours(intervals, "cabinet", m("09:00"), 60), false);
});

test("fermeture 14:15–14:45 : seule cette demi-heure est fermée (cas 2 de la phase 0)", () => {
  const { intervals } = getDayAvailability(MONDAY, settings([slot("09:00", "18:00")], { closures: [closure("14:15", "14:45")] }));
  assert.deepEqual(intervals.cabinet, [[m("09:00"), m("14:15")], [m("14:45"), m("18:00")]]);
  assert.deepEqual(computeClosedRanges(intervals, m("08:00"), m("19:00")), [
    { start: m("08:00"), end: m("09:00") },
    { start: m("14:15"), end: m("14:45") },
    { start: m("18:00"), end: m("19:00") },
  ]);
  // 13:30 et 13:45 tiennent avant ; 14:45 reprend juste après.
  const afternoon = generateCandidateStarts(intervals, "cabinet", 30, 15).filter((start) => start >= "13:00" && start < "15:30");
  assert.deepEqual(afternoon, ["13:00", "13:15", "13:30", "13:45", "14:45", "15:00", "15:15"]);
  assert.equal(isOpenAt(intervals, m("14:14")), true);
  assert.equal(isOpenAt(intervals, m("14:15")), false);
  assert.equal(isOpenAt(intervals, m("14:45")), true);
});

test("plusieurs plages dans la journée : la pause du midi n'est pas réservable", () => {
  const { intervals } = getDayAvailability(MONDAY, settings([slot("14:00", "18:00"), slot("09:00", "12:00")]));
  assert.deepEqual(intervals.home, [[m("09:00"), m("12:00")], [m("14:00"), m("18:00")]]);
  assert.equal(fitsWithinOpenHours(intervals, "home", m("11:30"), 60), false);
  assert.equal(fitsWithinOpenHours(intervals, "home", m("11:00"), 60), true);
});

test("deux plages contiguës sont fusionnées : un rendez-vous peut passer de l'une à l'autre", () => {
  const { intervals } = getDayAvailability(MONDAY, settings([slot("09:00", "12:00"), slot("12:00", "14:00")]));
  assert.deepEqual(intervals.cabinet, [[m("09:00"), m("14:00")]]);
  assert.equal(fitsWithinOpenHours(intervals, "cabinet", m("11:30"), 60), true);
});

test("fermeture « Cabinet uniquement » : le domicile reste ouvert", () => {
  const { intervals } = getDayAvailability(MONDAY, settings([slot("09:00", "12:00")], { closures: [closure("10:00", "11:00", "Cabinet uniquement")] }));
  assert.deepEqual(intervals.cabinet, [[m("09:00"), m("10:00")], [m("11:00"), m("12:00")]]);
  assert.deepEqual(intervals.home, [[m("09:00"), m("12:00")]]);
  // L'agenda n'ombre que ce qui est fermé pour les deux modes.
  assert.deepEqual(computeClosedRanges(intervals, m("09:00"), m("12:00")), []);
});

test("fermeture sur plusieurs jours : chaque journée de la période, jusqu'à 23:59 compris", () => {
  const availability = settings([slot("09:00", "18:00")], { closures: [closure("00:00", "23:59", "Tout fermer", "2026-10-01", "2026-10-07")] });
  const { open, intervals } = getDayAvailability(MONDAY, availability);
  // Journée travaillée vidée par une fermeture : toujours « ouverte » (ses
  // rendez-vous restent affichés), mais plus rien n'est réservable.
  assert.equal(open, true);
  assert.deepEqual(intervals, { cabinet: [], home: [] });
  const after = getDayAvailability(new Date(2026, 9, 12, 12), availability);
  assert.deepEqual(after.intervals.cabinet, [[m("09:00"), m("18:00")]]);
});

test("vacances : la journée est fermée", () => {
  const result = getDayAvailability(MONDAY, settings([slot("09:00", "18:00")], { vacations: [{ id: "v", startDate: "2026-10-03", endDate: "2026-10-10" }] }));
  assert.deepEqual(result, { open: false, intervals: { cabinet: [], home: [] } });
});

test("mode sans plage : rien n'est réservable dans ce mode", () => {
  const { intervals } = getDayAvailability(MONDAY, settings([slot("09:00", "12:00", true, false)]));
  assert.deepEqual(intervals.home, []);
  assert.deepEqual(generateCandidateStarts(intervals, "home", 30), []);
  assert.deepEqual(generateCandidateStarts(intervals, "cabinet", 60), ["09:00", "09:30", "10:00", "10:30", "11:00"]);
});

test("jour désactivé ou sans plage : fermé", () => {
  assert.equal(getDayAvailability(new Date(2026, 9, 6, 12), settings([slot("09:00", "12:00")])).open, false);
  assert.equal(getDayAvailability(MONDAY, settings([])).open, false);
});

test("une plage qui commence hors du pas propose aussi son premier horaire", () => {
  const { intervals } = getDayAvailability(MONDAY, settings([slot("09:20", "11:00")]));
  assert.deepEqual(generateCandidateStarts(intervals, "cabinet", 30, 30), ["09:20", "09:30", "10:00", "10:30"]);
});

test("pas « Désactivé » : les créneaux s'enchaînent depuis le début de chaque plage, pas depuis minuit", () => {
  const { intervals } = getDayAvailability(MONDAY, settings([slot("09:00", "12:00"), slot("14:00", "16:00")]));
  assert.deepEqual(generateCandidateStarts(intervals, "cabinet", 50, 0), ["09:00", "09:50", "10:40", "14:00", "14:50"]);
});

test("mergeIntervals et subtractInterval", () => {
  assert.deepEqual(mergeIntervals([[600, 700], [500, 600], [650, 800], [900, 900]]), [[500, 800]]);
  assert.deepEqual(subtractInterval([[500, 800]], [600, 650]), [[500, 600], [650, 800]]);
  assert.deepEqual(subtractInterval([[500, 800]], [400, 900]), []);
  assert.deepEqual(subtractInterval([[500, 800]], [800, 900]), [[500, 800]]);
});

test("fitsWithinOpenHours : faux pour une journée fermée ou une durée nulle", () => {
  assert.equal(fitsWithinOpenHours(null, "cabinet", m("09:00"), 30), false);
  assert.equal(fitsWithinOpenHours({ cabinet: [[540, 600]], home: [] }, "cabinet", m("09:00"), 0), false);
  assert.deepEqual(generateCandidateStarts(null, "cabinet", 30), []);
});
