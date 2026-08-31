import { test } from "node:test";
import assert from "node:assert/strict";
import { coordinatesForCity, NORMANDY_CITIES } from "../src/data/normandy-cities";

test("coordinatesForCity retourne les coordonnées d'une ville connue", () => {
  const rouen = coordinatesForCity("Rouen");
  assert.ok(rouen);
  assert.equal(rouen?.lat, 49.4432);
  assert.equal(rouen?.lng, 1.0999);
});

test("coordinatesForCity retourne null pour une ville hors de la liste, jamais un repli sur Rouen", () => {
  assert.equal(coordinatesForCity("Caen"), null);
  assert.equal(coordinatesForCity("Ville Inconnue"), null);
});

test("aucune ville de la liste ne s'appelle 'Caen' (contrôle du test précédent)", () => {
  assert.ok(!NORMANDY_CITIES.some((city) => city.name === "Caen"));
});
