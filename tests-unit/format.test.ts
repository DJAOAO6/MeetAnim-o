import { test } from "node:test";
import assert from "node:assert/strict";
import { formatNotificationBadge, pluralizeAnimals } from "../src/lib/format";

test("formatNotificationBadge shows the exact count at or below 99", () => {
  assert.equal(formatNotificationBadge(0), "0");
  assert.equal(formatNotificationBadge(12), "12");
  assert.equal(formatNotificationBadge(99), "99");
});

test("formatNotificationBadge caps display at 99+ beyond 99", () => {
  assert.equal(formatNotificationBadge(100), "99+");
  assert.equal(formatNotificationBadge(250), "99+");
});

test("pluralizeAnimals : aucun, un, plusieurs — jamais « animalaux »", () => {
  assert.equal(pluralizeAnimals(0), "aucun animal");
  assert.equal(pluralizeAnimals(1), "1 animal");
  assert.equal(pluralizeAnimals(2), "2 animaux");
  assert.equal(pluralizeAnimals(12), "12 animaux");
});
