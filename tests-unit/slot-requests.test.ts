import { test } from "node:test";
import assert from "node:assert/strict";
import { choiceRankLabel, requestedSlots, toggleSlotChoice } from "../src/lib/slot-requests";

const a = { date: "2026-10-12", time: "10:00" };
const b = { date: "2026-10-13", time: "14:30" };
const c = { date: "2026-10-13", time: "16:00" };
const d = { date: "2026-10-14", time: "09:00" };

test("cocher ajoute à la fin, décocher retire et fait remonter les suivants", () => {
  let choices = toggleSlotChoice([], a).choices;
  choices = toggleSlotChoice(choices, b).choices;
  choices = toggleSlotChoice(choices, c).choices;
  assert.deepEqual(choices, [a, b, c]);
  assert.deepEqual(toggleSlotChoice(choices, a).choices, [b, c]);
});

test("au-delà de 3 horaires, rien n'est ajouté", () => {
  const result = toggleSlotChoice([a, b, c], d);
  assert.equal(result.full, true);
  assert.deepEqual(result.choices, [a, b, c]);
});

test("rangs lisibles", () => {
  assert.equal(choiceRankLabel(1), "1er choix");
  assert.equal(choiceRankLabel(3), "3e choix");
});

test("horaires reçus par le serveur : 1 à 3, au bon format, sans doublon", () => {
  assert.deepEqual(requestedSlots({ date: "2026-10-12", start: "10:00" }), [{ date: "2026-10-12", start: "10:00" }]);
  const three = [{ date: "2026-10-12", start: "10:00" }, { date: "2026-10-13", start: "14:30" }, { date: "2026-10-13", start: "16:00" }];
  assert.deepEqual(requestedSlots({ date: "x", start: "y", slots: three }), three, "la liste prime");
  assert.equal(requestedSlots({ date: "2026-10-12", start: "10:00", slots: [...three, { date: "2026-10-14", start: "09:00" }] }), null);
  assert.equal(requestedSlots({ date: "2026-10-12", start: "10:00", slots: [three[0], three[0]] }), null);
  assert.equal(requestedSlots({ date: "2026-10-12", start: "10:00", slots: [{ date: "12/10/2026", start: "10:00" }] }), null);
});
