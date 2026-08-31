import { test } from "node:test";
import assert from "node:assert/strict";
import { destinationPoint, haversineDistanceKm } from "../src/lib/geo";

const rouen = { lat: 49.4432, lng: 1.0999 };

test("destinationPoint puis haversineDistanceKm retrouve la distance de départ (aller-retour)", () => {
  for (const distanceKm of [1, 15, 30, 50, 120]) {
    for (const bearing of [0, 45, 90, 180, 270]) {
      const point = destinationPoint(rouen, distanceKm, bearing);
      const roundTrip = haversineDistanceKm(rouen, point);
      assert.ok(Math.abs(roundTrip - distanceKm) < 0.01, `distance=${distanceKm} bearing=${bearing} : obtenu ${roundTrip}`);
    }
  }
});

test("destinationPoint vers l'est (90°) déplace la longitude sans changer significativement la latitude", () => {
  const point = destinationPoint(rouen, 20, 90);
  assert.ok(point.lng > rouen.lng);
  assert.ok(Math.abs(point.lat - rouen.lat) < 0.01);
});

test("destinationPoint vers le nord (0°) déplace la latitude sans changer la longitude", () => {
  const point = destinationPoint(rouen, 20, 0);
  assert.ok(point.lat > rouen.lat);
  assert.ok(Math.abs(point.lng - rouen.lng) < 1e-6);
});

test("destinationPoint avec une distance nulle retombe sur l'origine", () => {
  const point = destinationPoint(rouen, 0, 90);
  assert.ok(Math.abs(point.lat - rouen.lat) < 1e-9);
  assert.ok(Math.abs(point.lng - rouen.lng) < 1e-9);
});
