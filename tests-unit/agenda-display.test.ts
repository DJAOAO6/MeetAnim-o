import { strict as assert } from "node:assert";
import { test } from "node:test";
import { DEFAULT_AGENDA_DISPLAY, eventGeometry, eventsOutsideRange, isWeekdayShown, normalizeAgendaDisplay, pixelsPerMinute } from "../src/lib/agenda-display";

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
  const valid = normalizeAgendaDisplay({ dayStart: 6, dayEnd: 23, slotMinutes: 60, density: "compact" });
  assert.deepEqual([valid.dayStart, valid.dayEnd, valid.slotMinutes, valid.density], [6, 23, 60, "compact"]);
  // Les cases de 1 h 30 n'existent plus : un ancien réglage reprend 30 min.
  assert.equal(normalizeAgendaDisplay({ slotMinutes: 90 }).slotMinutes, 30);
});

test("une case plus longue est un peu plus haute, et le compact reste plus serré", () => {
  const cell = (slotMinutes: 15 | 30 | 45 | 60) => pixelsPerMinute({ slotMinutes, density: "comfortable" }) * slotMinutes;
  assert.ok(cell(15) < cell(30) && cell(30) < cell(45) && cell(45) < cell(60));
  // Une heure affichée prend moins de place quand les cases sont longues.
  assert.ok(pixelsPerMinute({ slotMinutes: 60, density: "comfortable" }) < pixelsPerMinute({ slotMinutes: 15, density: "comfortable" }));
  for (const slotMinutes of [15, 30, 45, 60] as const) {
    assert.ok(pixelsPerMinute({ slotMinutes, density: "compact" }) < pixelsPerMinute({ slotMinutes, density: "comfortable" }));
  }
});

test("un rendez-vous garde sa vraie durée : 45 min en grille d'une heure = 75 % d'une ligne", () => {
  const px = pixelsPerMinute({ slotMinutes: 60, density: "comfortable" });
  const rowHeight = px * 60;
  const { top, height } = eventGeometry(9 * 60 + 30, 45, 8, px);
  assert.equal(height / rowHeight, 0.75);
  assert.equal(top / rowHeight, 1.5);
});

test("la plage choisie est respectée ; ce qui en sort est signalé, pas caché", () => {
  const display = { ...DEFAULT_AGENDA_DISPLAY, dayStart: 9, dayEnd: 21 };
  const early = { start: 8 * 60, end: 9 * 60 };
  const straddling = { start: 8 * 60 + 30, end: 9 * 60 + 30 };
  const late = { start: 21 * 60, end: 21 * 60 + 30 };
  const { before, after } = eventsOutsideRange(display, [early, straddling, late]);
  assert.deepEqual(before, [early]);
  assert.deepEqual(after, [late]);
});

test("samedi et dimanche suivent leurs réglages, les autres jours restent", () => {
  const display = { ...DEFAULT_AGENDA_DISPLAY, showSaturday: false, showSunday: true };
  assert.equal(isWeekdayShown(6, display), false);
  assert.equal(isWeekdayShown(0, display), true);
  assert.equal(isWeekdayShown(3, display), true);
});
