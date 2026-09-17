import { test } from "node:test";
import assert from "node:assert/strict";
import { countTourStops, isTourFull, selectTourSlots, type BookedSlot, type TourWindow } from "../src/lib/tour-suggestion-rules";
import type { PublicZone } from "../src/data/public-booking";

/**
 * Règles de suggestion des créneaux de tournée.
 *
 * L'enjeu est simple : ce qui est proposé publiquement doit être réellement
 * réservable. Un créneau promis puis refusé à la soumission est bien pire que
 * pas de suggestion du tout.
 */
const rouenNord: PublicZone = {
  id: "zone-rouen-nord",
  name: "Rouen Nord",
  cities: ["Rouen", "Bois-Guillaume"],
  postalCodes: ["76000", "76230"],
  tourDays: [],
};

const rouenSud: PublicZone = {
  id: "zone-rouen-sud",
  name: "Rouen Sud",
  cities: ["Sotteville-lès-Rouen"],
  postalCodes: ["76300"],
  tourDays: [],
};

const tour: TourWindow = { startTime: "09:00", endTime: "12:00", maxStops: null, zones: [rouenNord] };

/** Créneaux que le calendrier normal proposerait ce jour-là, toutes les 30 min. */
const candidates = ["08:00", "08:30", "09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "12:00", "14:00"];

const booked = (start: string, end: string, extra: Partial<BookedSlot> = {}): BookedSlot => {
  const toMinutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
  return { start: toMinutes(start), end: toMinutes(end), home: true, postalCode: "76000", ...extra };
};

test("seuls les créneaux du passage sont proposés", () => {
  const slots = selectTourSlots({ candidates, tour, durationMinutes: 60, booked: [], limit: 10 });
  // 08:00 et 08:30 sont avant le passage ; 14:00 après. 11:30 ne tient pas
  // entièrement avant 12:00.
  assert.deepEqual(slots, ["09:00", "09:30", "10:00", "10:30", "11:00"]);
});

test("une prestation qui ne tient pas dans le passage n’est jamais proposée", () => {
  const slots = selectTourSlots({ candidates, tour, durationMinutes: 120, booked: [], limit: 10 });
  assert.deepEqual(slots, ["09:00", "09:30", "10:00"], "la séance doit finir avant 12:00");
});

test("un créneau déjà pris disparaît, temps de trajet compris", () => {
  // Visite de 10:00 à 11:00, plus 15 min de trajet : occupe jusqu'à 11:15.
  const slots = selectTourSlots({ candidates, tour, durationMinutes: 60, booked: [booked("10:00", "11:15")], limit: 10 });
  assert.deepEqual(slots, ["09:00"], "09:30 chevauche, 10:00 à 11:00 aussi");
});

test("le nombre de créneaux proposés est borné", () => {
  const slots = selectTourSlots({ candidates, tour, durationMinutes: 60, booked: [], limit: 3 });
  assert.deepEqual(slots, ["09:00", "09:30", "10:00"]);
});

/**
 * Le piège de la capacité : un rendez-vous à domicile dans une autre zone le
 * même jour n'est pas un arrêt de cette tournée. Le compter fermerait le
 * passage pour rien.
 */
test("la capacité ne compte que les arrêts du secteur de la tournée", () => {
  const sameDay = [
    booked("09:00", "10:00", { postalCode: "76000" }),
    booked("10:30", "11:30", { postalCode: "76300", city: "Sotteville-lès-Rouen" }),
    booked("14:00", "15:00", { home: false, postalCode: "76000" }),
  ];

  assert.equal(countTourStops(sameDay, [rouenNord]), 1, "une seule visite dans Rouen Nord");
  assert.equal(countTourStops(sameDay, [rouenSud]), 1, "et une seule dans Rouen Sud");
  assert.equal(countTourStops(sameDay, [rouenNord, rouenSud]), 2, "les deux pour une tournée multi-zone");
});

test("une tournée pleine ne propose plus rien", () => {
  const full: TourWindow = { ...tour, maxStops: 1 };
  const sameDay = [booked("09:00", "10:00")];

  assert.equal(isTourFull(sameDay, full), true);
  assert.deepEqual(selectTourSlots({ candidates, tour: full, durationMinutes: 60, booked: sameDay, limit: 10 }), []);

  // Sans limite déclarée, le passage reste ouvert.
  assert.equal(isTourFull(sameDay, tour), false);
});

test("un rendez-vous au cabinet ne remplit pas une tournée, mais occupe le créneau", () => {
  const cabinet = [booked("09:00", "10:00", { home: false })];
  assert.equal(countTourStops(cabinet, [rouenNord]), 0, "ce n’est pas un arrêt de tournée");

  const slots = selectTourSlots({ candidates, tour, durationMinutes: 60, booked: cabinet, limit: 10 });
  assert.ok(!slots.includes("09:00"), "le professionnel n’est pas disponible pour autant");
});

test("aucun créneau libre donne une liste vide, jamais une proposition creuse", () => {
  const packed = [booked("09:00", "12:00")];
  assert.deepEqual(selectTourSlots({ candidates, tour, durationMinutes: 60, booked: packed, limit: 10 }), []);
});
