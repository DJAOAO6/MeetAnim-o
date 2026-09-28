import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyGeocode, sameCity } from "../src/lib/geocode-precision";

test("un numéro trouvé avec un bon score : position exacte", () => {
  assert.equal(classifyGeocode("housenumber", 0.98), "EXACT");
  assert.equal(classifyGeocode("housenumber", 0.7), "EXACT");
});

test("un numéro au score faible ne se fait jamais passer pour exact", () => {
  assert.equal(classifyGeocode("housenumber", 0.62), "STREET");
  assert.equal(classifyGeocode("housenumber", 0.3), null);
});

test("la rue seule : précision rue ; une rue trop incertaine est refusée", () => {
  assert.equal(classifyGeocode("street", 0.88), "STREET");
  // « 75 rue des Lombards » renvoyait une autre rue avec 0,49 : refusé.
  assert.equal(classifyGeocode("street", 0.49), null);
});

test("seulement la commune : position approximative (ville)", () => {
  assert.equal(classifyGeocode("municipality", 0.9), "CITY");
  assert.equal(classifyGeocode("municipality", 0.2), null);
  assert.equal(classifyGeocode(undefined, 0.99), null);
});

test("homonymes : le résultat doit être dans la commune de la fiche", () => {
  assert.equal(sameCity("Saint-Aubin-lès-Elbeuf", "Saint-Aubin-lès-Elbeuf"), true);
  assert.equal(sameCity("saint aubin les elbeuf", "Saint-Aubin-lès-Elbeuf"), true);
  assert.equal(sameCity("Saint-Aubin-lès-Elbeuf", "Toulouse"), false);
  // Une commune à arrondissements reste la même commune.
  assert.equal(sameCity("Paris", "Paris 11e Arrondissement"), true);
});
