import { strict as assert } from "node:assert";
import { test } from "node:test";
import { departurePoint, hasCabinet, visitsHomes } from "../src/lib/practice-mode";

/**
 * Mode d'exercice : ce que le professionnel pratique vraiment.
 *
 * Le point sensible est le départ des tournées. Avec un cabinet, on part de
 * son adresse — publique, affichée aux clients. Sans cabinet, on part d'une
 * adresse privée (domicile, local) qui ne doit jamais fuiter côté public :
 * ces tests fixent lequel des deux est choisi, et ce qui se passe quand
 * l'adresse manque.
 */

const base = {
  address: "24 rue des Carmes",
  postalCode: "76000",
  city: "Rouen",
  latitude: 49.44,
  longitude: 1.09,
  departureLabel: "Maison",
  departureAddress: "3 rue du Pré, 76230 Bois-Guillaume",
  departureLatitude: 49.46,
  departureLongitude: 1.11,
};

test("avec un cabinet, les trajets partent de son adresse", () => {
  const point = departurePoint({ ...base, practiceMode: "BOTH" });
  assert.equal(point?.label, "Cabinet");
  assert.equal(point?.address, "24 rue des Carmes 76000 Rouen");
  assert.equal(point?.latitude, 49.44);
});

test("sans cabinet, ils partent du point de départ privé", () => {
  const point = departurePoint({ ...base, practiceMode: "HOME_ONLY" });
  assert.equal(point?.label, "Maison");
  assert.equal(point?.address, "3 rue du Pré, 76230 Bois-Guillaume");
  assert.equal(point?.latitude, 49.46);
});

test("sans cabinet et sans point de départ, il n'y a pas de départ : l'itinéraire commencera au premier arrêt", () => {
  assert.equal(departurePoint({ ...base, practiceMode: "HOME_ONLY", departureAddress: null }), null);
  assert.equal(departurePoint({ ...base, practiceMode: "HOME_ONLY", departureAddress: "   " }), null);
});

test("un point de départ sans nom en reçoit un, plutôt qu'une étiquette vide sur la carte", () => {
  const point = departurePoint({ ...base, practiceMode: "HOME_ONLY", departureLabel: null });
  assert.equal(point?.label, "Point de départ");
});

test("une adresse de cabinet vide ne produit pas un départ fantôme", () => {
  assert.equal(departurePoint({ ...base, practiceMode: "OFFICE_ONLY", address: "", postalCode: "", city: "" }), null);
});

test("chaque mode dit ce qui est pratiqué", () => {
  assert.deepEqual([hasCabinet("BOTH"), visitsHomes("BOTH")], [true, true]);
  assert.deepEqual([hasCabinet("HOME_ONLY"), visitsHomes("HOME_ONLY")], [false, true]);
  assert.deepEqual([hasCabinet("OFFICE_ONLY"), visitsHomes("OFFICE_ONLY")], [true, false]);
});
