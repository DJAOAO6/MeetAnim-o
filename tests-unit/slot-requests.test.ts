import { test } from "node:test";
import assert from "node:assert/strict";
import { choiceRankLabel, expiryNotice, requestExpiresAt, requestedSlots, toggleSlotChoice } from "../src/lib/slot-requests";

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

test("échéance : 72 h après la demande, si les horaires sont lointains", () => {
  const createdAt = new Date("2026-10-06T08:00:00.000Z");
  const expires = requestExpiresAt({ createdAt, slots: [{ date: "2026-10-20", start: "10:00" }, { date: "2026-10-21", start: "09:00" }] });
  assert.equal(expires.toISOString(), "2026-10-09T08:00:00.000Z");
});

test("échéance : 24 h avant le premier horaire proposé, à l'heure de Paris", () => {
  const createdAt = new Date("2026-10-06T08:00:00.000Z");
  // Le plus proche : jeudi 8 octobre à 10 h à Paris (heure d'été, 8 h UTC) → la veille à 10 h.
  const expires = requestExpiresAt({ createdAt, slots: [{ date: "2026-10-12", start: "09:00" }, { date: "2026-10-08", start: "10:00" }] });
  assert.equal(expires.toISOString(), "2026-10-07T08:00:00.000Z");
  // En hiver (UTC+1) : 10 h à Paris = 9 h UTC.
  const winter = requestExpiresAt({ createdAt: new Date("2026-12-01T08:00:00.000Z"), slots: [{ date: "2026-12-03", start: "10:00" }] });
  assert.equal(winter.toISOString(), "2026-12-02T09:00:00.000Z");
});

test("signalement côté professionnel dans les dernières 24 h", () => {
  const now = new Date("2026-10-06T08:00:00.000Z");
  assert.equal(expiryNotice(new Date("2026-10-08T08:00:00.000Z"), now), null, "encore 48 h : rien");
  assert.equal(expiryNotice(new Date("2026-10-06T13:00:00.000Z"), now), "expire dans 5 h");
  assert.equal(expiryNotice(new Date("2026-10-06T08:40:00.000Z"), now), "expire dans 40 min");
  assert.equal(expiryNotice(new Date("2026-10-06T07:00:00.000Z"), now), "expire d’un instant à l’autre");
});
