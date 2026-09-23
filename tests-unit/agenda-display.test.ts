import { strict as assert } from "node:assert";
import { test } from "node:test";
import { DEFAULT_AGENDA_DISPLAY, eventGeometry, isWeekdayShown, normalizeAgendaDisplay, pixelsPerMinute, visibleHourRange } from "../src/lib/agenda-display";

test("valeurs inconnues ou absentes : celles par défaut", () => {
  assert.deepEqual(normalizeAgendaDisplay(null), DEFAULT_AGENDA_DISPLAY);
  const odd = normalizeAgendaDisplay({ slotMinutes: 20, density: "huge", dayStart: 5, dayEnd: 30, showSunday: "oui" });
  assert.equal(odd.slotMinutes, 30);
  assert.equal(odd.density, "comfortable");
  assert.equal(odd.dayStart, 8);
  assert.equal(odd.dayEnd, 21);
  assert.equal(odd.showSunday, true);
});

test("une plage horaire à l'envers est refusée, pas retournée", () => {
  const reversed = normalizeAgendaDisplay({ dayStart: 18, dayEnd: 9 });
  assert.deepEqual([reversed.dayStart, reversed.dayEnd], [8, 21]);
  const same = normalizeAgendaDisplay({ dayStart: 10, dayEnd: 10 });
  assert.deepEqual([same.dayStart, same.dayEnd], [8, 21]);
  const valid = normalizeAgendaDisplay({ dayStart: 6, dayEnd: 23, slotMinutes: 90, density: "compact" });
  assert.deepEqual([valid.dayStart, valid.dayEnd, valid.slotMinutes, valid.density], [6, 23, 90, "compact"]);
});

test("la hauteur vient de la densité, jamais de la durée de grille", () => {
  // Une ligne confortable fait toujours la même hauteur, quelle que soit sa durée.
  assert.equal(pixelsPerMinute({ slotMinutes: 15, density: "comfortable" }) * 15, pixelsPerMinute({ slotMinutes: 60, density: "comfortable" }) * 60);
  assert.ok(pixelsPerMinute({ slotMinutes: 30, density: "compact" }) < pixelsPerMinute({ slotMinutes: 30, density: "comfortable" }));
});

test("un rendez-vous garde sa vraie durée : 45 min en grille d'une heure = 75 % d'une ligne", () => {
  const px = pixelsPerMinute({ slotMinutes: 60, density: "comfortable" });
  const rowHeight = px * 60;
  const { top, height } = eventGeometry(9 * 60 + 30, 45, 8, px);
  assert.equal(height / rowHeight, 0.75);
  assert.equal(top / rowHeight, 1.5);
});

test("un rendez-vous hors de la plage choisie l'élargit, sans jamais être caché", () => {
  const display = { ...DEFAULT_AGENDA_DISPLAY, dayStart: 8, dayEnd: 21 };
  assert.deepEqual(visibleHourRange(display, []), { startHour: 8, endHour: 21 });
  assert.deepEqual(visibleHourRange(display, [{ start: 7 * 60 + 15, end: 8 * 60 }, { start: 21 * 60, end: 21 * 60 + 30 }]), { startHour: 7, endHour: 22 });
});

test("samedi et dimanche suivent leurs réglages, les autres jours restent", () => {
  const display = { ...DEFAULT_AGENDA_DISPLAY, showSaturday: false, showSunday: true };
  assert.equal(isWeekdayShown(6, display), false);
  assert.equal(isWeekdayShown(0, display), true);
  assert.equal(isWeekdayShown(3, display), true);
});
