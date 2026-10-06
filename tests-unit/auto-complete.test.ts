import { test } from "node:test";
import assert from "node:assert/strict";
import { appointmentEndsAt, shouldAutoComplete } from "../src/lib/auto-complete";

// Octobre 2026 : heure d'été à Paris (UTC+2).
const since = new Date("2026-10-01T00:00:00.000Z");

test("la fin se calcule à l'heure de Paris, pas en UTC", () => {
  assert.equal(appointmentEndsAt({ date: "2026-10-05", start: "10:00", duration: 60 }).toISOString(), "2026-10-05T09:00:00.000Z");
  // En hiver (UTC+1).
  assert.equal(appointmentEndsAt({ date: "2026-12-07", start: "10:00", duration: 45 }).toISOString(), "2026-12-07T09:45:00.000Z");
});

test("un rendez-vous qui finit après minuit", () => {
  const lateNight = { date: "2026-10-05", start: "23:30", duration: 60 };
  assert.equal(appointmentEndsAt(lateNight).toISOString(), "2026-10-05T22:30:00.000Z", "00 h 30 à Paris, le 6");
  assert.equal(shouldAutoComplete(lateNight, since, new Date("2026-10-05T22:00:00.000Z")), false, "à minuit, pas encore fini");
  assert.equal(shouldAutoComplete(lateNight, since, new Date("2026-10-05T23:00:00.000Z")), true);
});

test("un rendez-vous du jour pas encore terminé attend", () => {
  const now = new Date("2026-10-06T08:00:00.000Z"); // 10 h à Paris
  assert.equal(shouldAutoComplete({ date: "2026-10-06", start: "09:30", duration: 60 }, since, now), false, "fin à 10 h 30");
  assert.equal(shouldAutoComplete({ date: "2026-10-06", start: "08:30", duration: 60 }, since, now), true, "fin à 9 h 30");
  assert.equal(shouldAutoComplete({ date: "2026-10-06", start: "09:00", duration: 60 }, since, now), true, "fin à 10 h pile");
});

test("rien de terminé avant la mise en service", () => {
  const now = new Date("2026-10-06T08:00:00.000Z");
  assert.equal(shouldAutoComplete({ date: "2026-09-30", start: "10:00", duration: 60 }, since, now), false);
  assert.equal(shouldAutoComplete({ date: "2026-10-01", start: "10:00", duration: 60 }, since, now), true);
});
