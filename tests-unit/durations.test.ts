import { test } from "node:test";
import assert from "node:assert/strict";
import { APPOINTMENT_DURATION_PRESETS, durationOptions } from "../src/data/durations";

test("liste commune des durées : 50 min comprise, dans l'ordre", () => {
  assert.deepEqual([...APPOINTMENT_DURATION_PRESETS], [30, 45, 50, 60, 75, 90, 120]);
});

test("durationOptions : valeur présente, absente, ordre", () => {
  assert.deepEqual(durationOptions(50), [30, 45, 50, 60, 75, 90, 120]);
  assert.deepEqual(durationOptions(40), [30, 40, 45, 50, 60, 75, 90, 120]);
  assert.deepEqual(durationOptions(15), [15, 30, 45, 50, 60, 75, 90, 120]);
  assert.deepEqual(durationOptions(180), [30, 45, 50, 60, 75, 90, 120, 180]);
  assert.deepEqual(durationOptions(null), [30, 45, 50, 60, 75, 90, 120]);
  assert.deepEqual(durationOptions(0), [30, 45, 50, 60, 75, 90, 120]);
});
