import { test } from "node:test";
import assert from "node:assert/strict";
import { circleBounds, geometryBounds, haversineDistanceKm, pointInGeometry, simplifyGeometry, type TerritoryGeometry } from "../src/lib/geo";

/** Carré de 1° × 1° avec un trou de 0,2° au centre. */
const squareWithHole: TerritoryGeometry = {
  type: "Polygon",
  coordinates: [
    [[1, 49], [2, 49], [2, 50], [1, 50], [1, 49]],
    [[1.4, 49.4], [1.6, 49.4], [1.6, 49.6], [1.4, 49.6], [1.4, 49.4]],
  ],
};

test("un point est dans le territoire, hors du territoire, ou dans une enclave", () => {
  assert.equal(pointInGeometry({ lat: 49.2, lng: 1.2 }, squareWithHole), true);
  assert.equal(pointInGeometry({ lat: 49.5, lng: 1.5 }, squareWithHole), false, "dans le trou : hors du territoire");
  assert.equal(pointInGeometry({ lat: 48.9, lng: 1.5 }, squareWithHole), false);
});

test("un territoire en plusieurs morceaux (îles) : chaque morceau compte", () => {
  const islands: TerritoryGeometry = {
    type: "MultiPolygon",
    coordinates: [
      [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
      [[[5, 5], [6, 5], [6, 6], [5, 6], [5, 5]]],
    ],
  };
  assert.equal(pointInGeometry({ lat: 5.5, lng: 5.5 }, islands), true);
  assert.equal(pointInGeometry({ lat: 3, lng: 3 }, islands), false);
  assert.deepEqual(geometryBounds(islands), { south: 0, west: 0, north: 6, east: 6 });
});

test("l'emprise d'un cercle contient exactement le cercle", () => {
  const center = { lat: 49.44, lng: 1.1 };
  const bounds = circleBounds(center, 15);
  assert.ok(Math.abs(haversineDistanceKm(center, { lat: bounds.north, lng: center.lng }) - 15) < 0.01);
  assert.ok(Math.abs(haversineDistanceKm(center, { lat: center.lat, lng: bounds.east }) - 15) < 0.01);
  assert.ok(bounds.west < center.lng && bounds.south < center.lat);
});

test("simplifier retire les points alignés sans déformer le contour", () => {
  const dense: TerritoryGeometry = { type: "Polygon", coordinates: [[[0, 0], [0.5, 0.00001], [1, 0], [1, 1], [0, 1], [0, 0]]] };
  const simplified = simplifyGeometry(dense, 0.001);
  assert.equal(simplified.type, "Polygon");
  assert.deepEqual((simplified as Extract<TerritoryGeometry, { type: "Polygon" }>).coordinates[0], [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]);
  assert.equal(pointInGeometry({ lat: 0.5, lng: 0.5 }, simplified), true);
});
