import { test } from "node:test";
import assert from "node:assert/strict";
import {
  availableDurations,
  formatDuration,
  selectionFromClick,
  selectionFromDrag,
  snapDown,
  snapUp,
  type SelectionBounds,
} from "../src/lib/agenda-selection";

/**
 * Règles de sélection d'un créneau libre dans l'agenda.
 *
 * Le cas qui compte vraiment est le dernier : une sélection ne doit jamais
 * traverser un rendez-vous existant. Le reste de l'interface en dépend — un
 * créneau qui enjambe un rendez-vous serait refusé par le serveur après coup,
 * alors qu'il paraissait sélectionnable.
 */
const bounds = (busy: Array<[number, number]> = []): SelectionBounds => ({
  dayStart: 8 * 60,
  dayEnd: 19 * 60,
  step: 15,
  busy: busy.map(([start, end]) => ({ start, end })),
});

test("le pas de temps ne produit jamais d’horaire bancal", () => {
  assert.equal(snapDown(13 * 60 + 7, 15), 13 * 60);
  assert.equal(snapDown(14 * 60 + 43, 15), 14 * 60 + 30);
  assert.equal(snapUp(14 * 60 + 43, 15), 14 * 60 + 45);
  assert.equal(snapDown(13 * 60 + 20, 30), 13 * 60);
  // Un pas absurde ne fait pas planter le calcul : repli sur le quart d'heure.
  assert.equal(snapDown(13 * 60 + 7, 0), 13 * 60);
});

test("un clic sélectionne la case cliquée, à la taille de l’intervalle affiché", () => {
  assert.deepEqual(selectionFromClick(2, 13 * 60 + 7, bounds()), { day: 2, startMinutes: 13 * 60, endMinutes: 13 * 60 + 15 });
  // Cases d'une heure : le créneau fait une heure.
  assert.deepEqual(selectionFromClick(2, 13 * 60 + 7, { ...bounds(), step: 60 }), { day: 2, startMinutes: 13 * 60, endMinutes: 14 * 60 });
});

test("dans une case en partie occupée, un clic prend la partie libre", () => {
  // Case 13:00–14:00, rendez-vous de 13:30 à 14:30 : un clic à 13:05 garde 13:00–13:30.
  const before = selectionFromClick(0, 13 * 60 + 5, { ...bounds([[13 * 60 + 30, 14 * 60 + 30]]), step: 60 });
  assert.deepEqual(before, { day: 0, startMinutes: 13 * 60, endMinutes: 13 * 60 + 30 });
  // Rendez-vous de 12:30 à 13:45 : un clic à 13:50 garde 13:45–14:00.
  const after = selectionFromClick(0, 13 * 60 + 50, { ...bounds([[12 * 60 + 30, 13 * 60 + 45]]), step: 60 });
  assert.deepEqual(after, { day: 0, startMinutes: 13 * 60 + 45, endMinutes: 14 * 60 });
});

test("un clic sur un rendez-vous n’ouvre aucune sélection de zone libre", () => {
  assert.equal(selectionFromClick(0, 14 * 60, bounds([[13 * 60 + 30, 14 * 60 + 30]])), null);
});

test("un clic qui ne laisse pas la place d’un pas de temps ne sélectionne rien", () => {
  // Rendez-vous à 13:10 : il reste dix minutes, moins qu'un quart d'heure.
  assert.equal(selectionFromClick(0, 13 * 60 + 5, bounds([[13 * 60 + 10, 14 * 60]])), null);
});

test("le glissement construit la plage, vers le bas comme vers le haut", () => {
  const down = selectionFromDrag(1, 13 * 60, 15 * 60 + 20, bounds());
  assert.deepEqual(down, { day: 1, startMinutes: 13 * 60, endMinutes: 15 * 60 + 30 });

  // Vers le haut : le point de départ devient la fin de la plage.
  const up = selectionFromDrag(1, 15 * 60, 13 * 60 + 5, bounds());
  assert.deepEqual(up, { day: 1, startMinutes: 13 * 60, endMinutes: 15 * 60 + 15 });
});

test("le glissement est borné par la grille affichée", () => {
  const selection = selectionFromDrag(0, 18 * 60, 23 * 60, bounds());
  assert.equal(selection!.endMinutes, 19 * 60, "jamais au-delà de la dernière heure affichée");
});

/**
 * Le cas du §15, mot pour mot : libre 13:00–14:00, rendez-vous 14:00–15:00,
 * libre 15:00–17:00. Une sélection partie de 13:00 s'arrête à 14:00.
 */
test("une sélection ne traverse jamais un rendez-vous existant", () => {
  const withAppointment = bounds([[14 * 60, 15 * 60]]);

  const selection = selectionFromDrag(3, 13 * 60, 17 * 60, withAppointment);
  assert.deepEqual(selection, { day: 3, startMinutes: 13 * 60, endMinutes: 14 * 60 });

  // Et depuis l'autre côté : partir de 16:00 et remonter s'arrête à 15:00.
  const upwards = selectionFromDrag(3, 16 * 60, 13 * 60, withAppointment);
  assert.deepEqual(upwards, { day: 3, startMinutes: 15 * 60, endMinutes: 16 * 60 + 15 });
});

test("les durées proposées sur téléphone tiennent dans la place réellement libre", () => {
  const selection = { day: 0, startMinutes: 13 * 60, endMinutes: 13 * 60 + 45 };

  assert.deepEqual(availableDurations(selection, bounds()), [30, 60, 90, 120]);
  // Rendez-vous à 14:00 : il ne reste qu'une heure.
  assert.deepEqual(availableDurations(selection, bounds([[14 * 60, 15 * 60]])), [30, 60]);
  // Moins de trente minutes : la place réelle est proposée telle quelle.
  assert.deepEqual(availableDurations(selection, bounds([[13 * 60 + 20, 15 * 60]])), [20]);
});

test("les durées se lisent comme on les dit", () => {
  assert.equal(formatDuration(45), "45 min");
  assert.equal(formatDuration(60), "1 h");
  assert.equal(formatDuration(150), "2 h 30");
  assert.equal(formatDuration(65), "1 h 05");
});
