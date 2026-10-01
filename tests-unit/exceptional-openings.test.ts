import { test } from "node:test";
import assert from "node:assert/strict";
import { getDayAvailability } from "../src/lib/availability";
import { openingProblem, singleDayClosuresOver, trimClosure, upcomingOpenings } from "../src/lib/availability-editing";
import { generateCandidateStarts, timeToMinutes } from "../src/lib/booking-validation";
import type { AvailabilitySettings, ExceptionalClosure, ExceptionalOpening } from "../src/data/settings";

/**
 * Ouvertures exceptionnelles (chantier C2, phase 4). Ouverture > fermeture >
 * horaires habituels : l'ouverture, action la plus explicite, l'emporte sur
 * une fermeture ou des vacances couvrant la même période.
 */

const SUNDAY = new Date(2026, 9, 11, 12); // dimanche 11 octobre 2026
const SUNDAY_ID = "2026-10-11";
const MONDAY = new Date(2026, 9, 12, 12);
const m = timeToMinutes;

const opening = (patch: Partial<ExceptionalOpening> = {}): ExceptionalOpening =>
  ({ id: "o", date: SUNDAY_ID, start: "10:00", end: "12:00", cabinet: false, home: true, reason: "", ...patch });

function settings(extra: Partial<AvailabilitySettings> = {}): AvailabilitySettings {
  return {
    days: [
      { id: "sunday", label: "Dimanche", enabled: false, slots: [] },
      { id: "monday", label: "Lundi", enabled: true, slots: [{ id: "m", start: "09:00", end: "12:00", cabinet: true, home: true }] },
    ],
    travelBuffer: 30, breakAfterAppointment: 0, closures: [], openings: [], vacations: [],
    defaultAppointmentDuration: 60, slotInterval: 30,
    ...extra,
  };
}

test("dimanche fermé + ouverture 10:00–12:00 à domicile : ouvert à domicile seulement", () => {
  const { open, intervals } = getDayAvailability(SUNDAY, settings({ openings: [opening()] }));
  assert.equal(open, true);
  assert.deepEqual(intervals, { cabinet: [], home: [[m("10:00"), m("12:00")]] });
  assert.deepEqual(generateCandidateStarts(intervals, "home", 60, 30), ["10:00", "10:30", "11:00"]);
  assert.deepEqual(generateCandidateStarts(intervals, "cabinet", 60, 30), []);
});

test("l'ouverture l'emporte sur les vacances : ouvert sur cette plage seulement", () => {
  const vacations = [{ id: "v", startDate: "2026-10-10", endDate: "2026-10-20" }];
  const { intervals } = getDayAvailability(MONDAY, settings({ vacations, openings: [opening({ date: "2026-10-12", start: "14:00", end: "16:00", cabinet: true })] }));
  assert.deepEqual(intervals, { cabinet: [[m("14:00"), m("16:00")]], home: [[m("14:00"), m("16:00")]] });
});

test("l'ouverture l'emporte sur une fermeture du même jour, et s'ajoute aux horaires habituels", () => {
  const closures: ExceptionalClosure[] = [{ id: "c", date: "2026-10-12", start: "00:00", end: "23:59", scope: "Tout fermer", reason: "" }];
  const closed = getDayAvailability(MONDAY, settings({ closures, openings: [opening({ date: "2026-10-12", start: "10:00", end: "11:00", cabinet: true, home: false })] }));
  assert.deepEqual(closed.intervals, { cabinet: [[m("10:00"), m("11:00")]], home: [] });
  // Sans fermeture : la plage habituelle 09:00–12:00 et l'ouverture 11:30–13:00 se fusionnent.
  const extended = getDayAvailability(MONDAY, settings({ openings: [opening({ date: "2026-10-12", start: "11:30", end: "13:00", cabinet: true, home: false })] }));
  assert.deepEqual(extended.intervals.cabinet, [[m("09:00"), m("13:00")]]);
  assert.deepEqual(extended.intervals.home, [[m("09:00"), m("12:00")]]);
});

test("une ouverture d'un autre jour ne change rien", () => {
  assert.equal(getDayAvailability(SUNDAY, settings({ openings: [opening({ date: "2026-10-18" })] })).open, false);
});

test("validation : date, horaires, au moins un mode, modes pratiqués", () => {
  assert.equal(openingProblem(opening(), "BOTH"), null);
  assert.match(openingProblem(opening({ date: "11/10/2026" }), "BOTH")!, /date invalide/);
  assert.match(openingProblem(opening({ start: "12:00", end: "10:00" }), "BOTH")!, /fin doit suivre/);
  assert.match(openingProblem(opening({ start: "25:00" }), "BOTH")!, /horaire invalide/);
  assert.match(openingProblem(opening({ cabinet: false, home: false }), "BOTH")!, /cabinet, le domicile ou les deux/);
  assert.match(openingProblem(opening({ cabinet: true, home: false }), "HOME_ONLY")!, /pas au cabinet/);
  assert.match(openingProblem(opening(), "OFFICE_ONLY")!, /pas à domicile/);
});

test("seules les ouvertures d'aujourd'hui et à venir sont listées, dans l'ordre", () => {
  const list = upcomingOpenings([opening({ id: "b", date: "2026-10-20" }), opening({ id: "past", date: "2026-09-01" }), opening({ id: "a", date: "2026-10-11" })], "2026-10-11");
  assert.deepEqual(list.map((item) => item.id), ["a", "b"]);
});

test("fermeture ponctuelle sous la sélection : retrouvée, puis rognée ou retirée", () => {
  const closure: ExceptionalClosure = { id: "c", date: "2026-10-12", start: "10:00", end: "15:00", scope: "Tout fermer", reason: "Indisponible" };
  const longOne: ExceptionalClosure = { ...closure, id: "long", endDate: "2026-10-20" };
  assert.deepEqual(singleDayClosuresOver([closure, longOne], "2026-10-12", "11:00", "12:00").map((item) => item.id), ["c"]);
  assert.deepEqual(singleDayClosuresOver([closure], "2026-10-12", "15:00", "16:00"), []);
  assert.deepEqual(trimClosure(closure, "11:00", "12:00").map((item) => [item.id, item.start, item.end]), [["c", "10:00", "11:00"], ["c-suite", "12:00", "15:00"]]);
  assert.deepEqual(trimClosure(closure, "10:00", "12:00").map((item) => [item.id, item.start, item.end]), [["c", "12:00", "15:00"]]);
  assert.deepEqual(trimClosure(closure, "09:00", "16:00"), []);
});
