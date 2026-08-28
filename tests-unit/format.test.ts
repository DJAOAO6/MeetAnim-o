import { test } from "node:test";
import assert from "node:assert/strict";
import { formatNotificationBadge } from "../src/lib/format";

test("formatNotificationBadge shows the exact count at or below 99", () => {
  assert.equal(formatNotificationBadge(0), "0");
  assert.equal(formatNotificationBadge(12), "12");
  assert.equal(formatNotificationBadge(99), "99");
});

test("formatNotificationBadge caps display at 99+ beyond 99", () => {
  assert.equal(formatNotificationBadge(100), "99+");
  assert.equal(formatNotificationBadge(250), "99+");
});
