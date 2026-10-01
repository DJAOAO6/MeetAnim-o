import { test } from "node:test";
import assert from "node:assert/strict";
import { conflictsWith, fitsWithinOpenHours, generateCandidateStarts, isSlotFree, occupiedMinutes, timeToMinutes } from "../src/lib/booking-validation";

/**
 * Pause après un rendez-vous et tampons dans les deux sens (chantier C2,
 * phase 2). Un rendez-vous occupe : cabinet = durée + pause ; domicile =
 * durée + trajet + pause. Avant, seul le rendez-vous existant portait son
 * trajet : un rendez-vous à domicile posé juste avant un autre ne réservait
 * pas le temps de revenir.
 */

const m = timeToMinutes;
const travelOnly = { travelBuffer: 30, breakAfterAppointment: 0 };
const breakOnly = { travelBuffer: 0, breakAfterAppointment: 15 };
const both = { travelBuffer: 30, breakAfterAppointment: 10 };

test("occupiedMinutes : cabinet = durée + pause ; domicile = durée + trajet + pause", () => {
  assert.equal(occupiedMinutes({ duration: 50, mode: "CABINET" }, both), 60);
  assert.equal(occupiedMinutes({ duration: 50, mode: "DOMICILE" }, both), 90);
  // Toutes les écritures du mode se valent.
  assert.equal(occupiedMinutes({ duration: 50, mode: "home" }, both), 90);
  assert.equal(occupiedMinutes({ duration: 50, mode: "HOME" }, both), 90);
  assert.equal(occupiedMinutes({ duration: 50, mode: "cabinet" }, both), 60);
});

test("pause seule : 10:50 est refusé après un rendez-vous 10:00–10:50, 11:05 accepté", () => {
  const existing = { start: m("10:00"), duration: 50, mode: "cabinet" as const };
  assert.equal(conflictsWith({ start: m("10:50"), duration: 50, mode: "cabinet" }, existing, breakOnly), true);
  assert.equal(conflictsWith({ start: m("11:04"), duration: 50, mode: "cabinet" }, existing, breakOnly), true);
  assert.equal(conflictsWith({ start: m("11:05"), duration: 50, mode: "cabinet" }, existing, breakOnly), false);
});

test("trajet + pause : après un rendez-vous à domicile 09:00–10:00, rien avant 10:40", () => {
  const existing = { start: m("09:00"), duration: 60, mode: "DOMICILE" as const };
  assert.equal(conflictsWith({ start: m("10:30"), duration: 30, mode: "cabinet" }, existing, both), true);
  assert.equal(conflictsWith({ start: m("10:40"), duration: 30, mode: "cabinet" }, existing, both), false);
});

test("le tampon du nouveau rendez-vous ne doit pas empiéter sur le suivant (cas 3 de la phase 0)", () => {
  // Domicile 09:00–10:00 + 30 min de trajet, rendez-vous au cabinet déjà pris à 10:00.
  const next = { start: m("10:00"), duration: 60, mode: "CABINET" as const };
  assert.equal(conflictsWith({ start: m("09:00"), duration: 60, mode: "home" }, next, travelOnly), true);
  assert.equal(conflictsWith({ start: m("08:31"), duration: 60, mode: "home" }, next, travelOnly), true);
  // 08:30–09:30 puis 30 min de trajet : arrivé pile pour 10:00.
  assert.equal(conflictsWith({ start: m("08:30"), duration: 60, mode: "home" }, next, travelOnly), false);
  // Au cabinet, sans trajet, 09:00–10:00 tient juste.
  assert.equal(conflictsWith({ start: m("09:00"), duration: 60, mode: "cabinet" }, next, travelOnly), false);
});

test("dernier rendez-vous de la journée : son tampon peut dépasser la fermeture", () => {
  // Plage 09:00–18:00 : un rendez-vous à domicile 17:00–18:00 tient, même si
  // son trajet et sa pause mènent à 18:40. Seule la durée doit tenir.
  const intervals = { cabinet: [], home: [[m("09:00"), m("18:00")]] as Array<[number, number]> };
  assert.equal(fitsWithinOpenHours(intervals, "home", m("17:00"), 60), true);
  assert.equal(isSlotFree({ start: m("17:00"), duration: 60, mode: "home" }, [], both), true);
  assert.deepEqual(generateCandidateStarts(intervals, "home", 60, 30).at(-1), "17:00");
});

test("créneau bloqué ou agenda externe : seules les durées comptent", () => {
  const blocked = { start: m("10:00"), duration: 60 };
  assert.equal(conflictsWith({ start: m("09:00"), duration: 60, mode: "home" }, blocked, both), false);
  assert.equal(conflictsWith({ start: m("09:30"), duration: 60, mode: "home" }, blocked, both), true);
});

test("isSlotFree lit les intervalles tels que renvoyés au navigateur", () => {
  const occupied = [{ start: "10:00", duration: 50, mode: "CABINET" as const }, { start: "14:00", duration: 60 }];
  const at = (start: string) => ({ start: m(start), duration: 50, mode: "CABINET" as const });
  assert.equal(isSlotFree(at("10:50"), occupied, breakOnly), false);
  assert.equal(isSlotFree(at("11:15"), occupied, breakOnly), true);
  // Sa propre pause heurte le rendez-vous de 10:00 : 09:00–09:50 + 15 min.
  assert.equal(isSlotFree(at("09:00"), occupied, breakOnly), false);
  assert.equal(isSlotFree(at("08:45"), occupied, breakOnly), true);
});

test("pas « À la suite » avec pause : les créneaux s'enchaînent sur durée + pause", () => {
  const intervals = { cabinet: [[m("09:00"), m("12:00")]] as Array<[number, number]>, home: [] };
  assert.deepEqual(generateCandidateStarts(intervals, "cabinet", 50, 0, 10), ["09:00", "10:00", "11:00"]);
  assert.deepEqual(generateCandidateStarts(intervals, "cabinet", 50, 0, 0), ["09:00", "09:50", "10:40"]);
});
