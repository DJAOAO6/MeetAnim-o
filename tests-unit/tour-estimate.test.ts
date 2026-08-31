import { test } from "node:test";
import assert from "node:assert/strict";
import { estimateExpectedReturnTime, estimateTourRoute, formatGeoWarningMessage, formatTourEstimate, ROAD_DETOUR_FACTOR } from "../src/lib/tour-estimate";
import { haversineDistanceKm } from "../src/lib/geo";
import type { Coordinates } from "../src/data/tours";

const cabinet: Coordinates = { lat: 49.44, lng: 1.1 };
const stopA: Coordinates = { lat: 49.9, lng: 1.08 };
const stopB: Coordinates = { lat: 49.5, lng: 0.19 };

test("estimateTourRoute inclut le cabinet en départ et retour quand il est géocodé", () => {
  const expectedStraightLineKm = haversineDistanceKm(cabinet, stopA) + haversineDistanceKm(stopA, stopB) + haversineDistanceKm(stopB, cabinet);
  const estimate = estimateTourRoute(cabinet, [{ coordinates: stopA }, { coordinates: stopB }]);

  assert.ok(estimate.distanceKm !== null);
  assert.ok(Math.abs(estimate.distanceKm! - expectedStraightLineKm * ROAD_DETOUR_FACTOR) < 0.001);
  assert.equal(estimate.unlocatedStopCount, 0);
  assert.ok(estimate.durationMinutes !== null);
  assert.equal(estimate.durationMinutes! % 5, 0);
});

test("estimateTourRoute part du premier arrêt localisé quand le cabinet n'est pas géocodé", () => {
  const expectedStraightLineKm = haversineDistanceKm(stopA, stopB);
  const estimate = estimateTourRoute(null, [{ coordinates: stopA }, { coordinates: stopB }]);

  assert.ok(Math.abs(estimate.distanceKm! - expectedStraightLineKm * ROAD_DETOUR_FACTOR) < 0.001);
});

test("estimateTourRoute exclut les arrêts sans coordonnées et les compte, sans deviner leur position", () => {
  const estimate = estimateTourRoute(cabinet, [{ coordinates: stopA }, { coordinates: null }, { coordinates: stopB }]);
  assert.equal(estimate.unlocatedStopCount, 1);
  assert.ok(estimate.distanceKm !== null);
});

test("estimateTourRoute retourne null quand moins de deux points sont localisés", () => {
  assert.deepEqual(estimateTourRoute(null, []), { distanceKm: null, durationMinutes: null, unlocatedStopCount: 0 });
  assert.deepEqual(estimateTourRoute(null, [{ coordinates: stopA }]), { distanceKm: null, durationMinutes: null, unlocatedStopCount: 0 });
});

test("formatTourEstimate affiche distance et durée en l'absence d'arrêt non localisé", () => {
  const text = formatTourEstimate({ distanceKm: 68.2, durationMinutes: 70, unlocatedStopCount: 0 });
  assert.equal(text, "≈ 68 km · ≈ 1 h 10 de route");
});

test("formatTourEstimate n'affiche que la distance en présence d'un arrêt non localisé", () => {
  const text = formatTourEstimate({ distanceKm: 68.2, durationMinutes: 70, unlocatedStopCount: 1 });
  assert.equal(text, "≈ 68 km (1 arrêt non localisé)");
});

test("formatTourEstimate gère le pluriel pour plusieurs arrêts non localisés", () => {
  const text = formatTourEstimate({ distanceKm: 40, durationMinutes: 45, unlocatedStopCount: 2 });
  assert.equal(text, "≈ 40 km (2 arrêts non localisés)");
});

test("formatTourEstimate gère l'absence totale de distance estimable", () => {
  assert.equal(formatTourEstimate({ distanceKm: null, durationMinutes: null, unlocatedStopCount: 3 }), "Distance non estimée (position inconnue)");
  assert.equal(formatTourEstimate({ distanceKm: null, durationMinutes: null, unlocatedStopCount: 0 }), "Distance non estimée");
});

test("estimateExpectedReturnTime ajoute le trajet de retour quand cabinet et dernier arrêt sont localisés", () => {
  const withoutReturn = estimateExpectedReturnTime(null, { endTime: "17:00", coordinates: stopB });
  const withReturn = estimateExpectedReturnTime(cabinet, { endTime: "17:00", coordinates: stopB });
  assert.equal(withoutReturn, "17:00");
  assert.notEqual(withReturn, "17:00");
  assert.ok(withReturn! > "17:00");
});

test("estimateExpectedReturnTime retombe sur la fin du dernier arrêt sans cabinet ou sans localisation", () => {
  assert.equal(estimateExpectedReturnTime(null, { endTime: "18:30", coordinates: null }), "18:30");
  assert.equal(estimateExpectedReturnTime(cabinet, { endTime: "18:30", coordinates: null }), "18:30");
});

test("estimateExpectedReturnTime retourne null sans dernier arrêt", () => {
  assert.equal(estimateExpectedReturnTime(cabinet, undefined), null);
});

test("formatGeoWarningMessage reprend l'exemple du cahier des charges (rendez-vous précédent)", () => {
  const text = formatGeoWarningMessage("previous", "à Louviers", 70, 45);
  assert.equal(text, "Le rendez-vous précédent est à Louviers, à environ 1 h 10 de route. Il ne reste que 45 minutes entre les deux.");
});

test("formatGeoWarningMessage gère le rendez-vous suivant et un voisin au cabinet", () => {
  const text = formatGeoWarningMessage("next", "au cabinet", 20, 15);
  assert.equal(text, "Le rendez-vous suivant est au cabinet, à environ 20 min de route. Il ne reste que 15 minutes entre les deux.");
});

test("formatGeoWarningMessage arrondit le temps de trajet et l'écart, sans jamais afficher de minutes négatives", () => {
  const text = formatGeoWarningMessage("previous", "à Rouen", 12.6, -2);
  assert.equal(text, "Le rendez-vous précédent est à Rouen, à environ 13 min de route. Il ne reste que 0 minute entre les deux.");
});
