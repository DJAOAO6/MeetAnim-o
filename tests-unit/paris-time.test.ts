import { test } from "node:test";
import assert from "node:assert/strict";
import { parisDateId, parisWallTimeToDate } from "../src/lib/paris-time";

/**
 * Le serveur de production tourne en UTC, les rendez-vous sont en heure de
 * Paris. Une erreur d'une heure ici, c'est un rappel envoyé trop tôt ou pas
 * du tout — d'où les cas autour des changements d'heure.
 */

test("été : 14 h 00 à Paris = 12 h 00 UTC", () => {
  assert.equal(parisWallTimeToDate("2026-07-01", "14:00").toISOString(), "2026-07-01T12:00:00.000Z");
});

test("hiver : 14 h 00 à Paris = 13 h 00 UTC", () => {
  assert.equal(parisWallTimeToDate("2026-12-01", "14:00").toISOString(), "2026-12-01T13:00:00.000Z");
});

test("jour du passage à l'heure d'été (29 mars 2026), après le changement", () => {
  assert.equal(parisWallTimeToDate("2026-03-29", "10:00").toISOString(), "2026-03-29T08:00:00.000Z");
});

test("jour du retour à l'heure d'hiver (25 octobre 2026), après le changement", () => {
  assert.equal(parisWallTimeToDate("2026-10-25", "10:00").toISOString(), "2026-10-25T09:00:00.000Z");
});

test("le jour à Paris n'est pas le jour UTC entre minuit et 2 h", () => {
  // 23 h 30 UTC le 20 septembre = 1 h 30 à Paris le 21.
  const now = new Date("2026-09-20T23:30:00.000Z");
  assert.equal(parisDateId(now), "2026-09-21");
  assert.equal(parisDateId(now, 1), "2026-09-22");
});
