import { test } from "node:test";
import assert from "node:assert/strict";
import { chainStopTimings, computeStopTiming } from "../src/lib/tour-timing";

test("un arrêt non verrouillé part directement de l'heure d'arrivée calculée", () => {
  const result = computeStopTiming({ cursorMinutes: 8 * 60, legMinutes: 20, locked: false, fixedTime: null, serviceMinutes: 30 });
  assert.equal(result.arrivalTime, "08:20");
  assert.equal(result.departureTime, "08:50");
  assert.equal(result.lateWarningMinutes, null);
});

test("un arrêt verrouillé en avance retombe sur son heure fixe, sans alerte", () => {
  // Trajet 10 min depuis 08:00 -> arrivée réaliste 08:10, mais le rendez-vous est à 08:30 : on attend.
  const result = computeStopTiming({ cursorMinutes: 8 * 60, legMinutes: 10, locked: true, fixedTime: "08:30", serviceMinutes: 30 });
  assert.equal(result.arrivalTime, "08:30");
  assert.equal(result.departureTime, "09:00");
  assert.equal(result.lateWarningMinutes, null);
});

test("un arrêt verrouillé en retard affiche l'heure réaliste et le nombre de minutes manquantes", () => {
  // Trajet 42 min depuis 13h18 (fin de la consultation précédente) -> arrivée réaliste 14:00, rendez-vous prévu à 13:48.
  const result = computeStopTiming({ cursorMinutes: 13 * 60 + 18, legMinutes: 42, locked: true, fixedTime: "13:48", serviceMinutes: 30 });
  assert.equal(result.arrivalTime, "14:00");
  assert.equal(result.lateWarningMinutes, 12);
});

test("un arrêt verrouillé pile à l'heure ne déclenche pas d'alerte (égalité, pas de dépassement)", () => {
  const result = computeStopTiming({ cursorMinutes: 10 * 60, legMinutes: 15, locked: true, fixedTime: "10:15", serviceMinutes: 20 });
  assert.equal(result.lateWarningMinutes, null);
});

test("computeStopTiming replie l'heure affichée sur 24h même si le curseur dépasse minuit", () => {
  const result = computeStopTiming({ cursorMinutes: 23 * 60 + 50, legMinutes: 20, locked: false, fixedTime: null, serviceMinutes: 0 });
  assert.equal(result.arrivalTime, "00:10");
});

test("chainStopTimings propage l'heure de départ + le temps de sécurité vers l'arrêt suivant", () => {
  const [first, second] = chainStopTimings(9 * 60, 10, [
    { legMinutes: 15, locked: false, fixedTime: null, serviceMinutes: 30 },
    { legMinutes: 20, locked: false, fixedTime: null, serviceMinutes: 0 },
  ]);
  assert.equal(first.arrivalTime, "09:15");
  assert.equal(first.departureTime, "09:45");
  // 09:45 (départ) + 10 min sécurité + 20 min trajet = 10:15
  assert.equal(second.arrivalTime, "10:15");
});

test("chainStopTimings reste correct même si la chaîne franchit minuit (curseur non borné entre arrêts)", () => {
  const [first, second] = chainStopTimings(23 * 60 + 40, 0, [
    { legMinutes: 30, locked: false, fixedTime: null, serviceMinutes: 20 },
    { legMinutes: 10, locked: false, fixedTime: null, serviceMinutes: 0 },
  ]);
  assert.equal(first.arrivalTime, "00:10");
  assert.equal(first.departureTime, "00:30");
  assert.equal(second.arrivalTime, "00:40");
});

test("chainStopTimings détecte un retard qui se répercute sur l'arrêt verrouillé suivant sans l'aggraver artificiellement", () => {
  const [, second] = chainStopTimings(13 * 60, 0, [
    { legMinutes: 60, locked: true, fixedTime: "13:30", serviceMinutes: 30 }, // arrive 14:00 au lieu de 13:30 -> 30 min de retard
    { legMinutes: 15, locked: true, fixedTime: "14:15", serviceMinutes: 20 }, // départ réel 14:30 + 15 min trajet = 14:45, prévu 14:15
  ]);
  assert.equal(second.arrivalTime, "14:45");
  assert.equal(second.lateWarningMinutes, 30);
});
