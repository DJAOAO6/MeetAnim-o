import { test } from "node:test";
import assert from "node:assert/strict";
import { outsideServiceArea, outsideServiceAreaMessage, serviceAreaOf, serviceAreaText } from "../src/lib/service-area";

const rouen = { label: "Rouen", latitude: 49.4431, longitude: 1.0993, radiusKm: 30 };

test("texte public du secteur", () => {
  assert.equal(serviceAreaText(rouen), "Se déplace jusqu’à 30 km autour de Rouen");
  assert.equal(serviceAreaText({ label: "Rouen", radiusKm: null }), "Se déplace autour de Rouen, sans limite de distance");
});

test("hors secteur : distance arrondie au-delà du rayon, sinon null", () => {
  // Elbeuf (~18 km) : dans le secteur ; Le Havre (~75 km) : au-delà.
  assert.equal(outsideServiceArea(rouen, { lat: 49.2867, lng: 1.0086 }), null);
  const havre = outsideServiceArea(rouen, { lat: 49.4944, lng: 0.1079 });
  assert.ok(havre !== null && havre > 60 && havre < 90, String(havre));
  // Pas de limite, pas de secteur, adresse non localisée : on ne dit rien.
  assert.equal(outsideServiceArea({ ...rouen, radiusKm: null }, { lat: 49.4944, lng: 0.1079 }), null);
  assert.equal(outsideServiceArea(null, { lat: 49.4944, lng: 0.1079 }), null);
  assert.equal(outsideServiceArea(rouen, null), null);
});

test("message au client et secteur d'un profil", () => {
  assert.equal(outsideServiceAreaMessage(42, rouen), "Votre adresse est à environ 42 km de Rouen, au-delà du secteur habituel (30 km). Vous pouvez envoyer votre demande : le professionnel vous confirmera s’il peut se déplacer.");
  assert.equal(serviceAreaOf({ serviceAreaLabel: null, serviceAreaLatitude: 49, serviceAreaLongitude: 1, serviceAreaRadiusKm: 30 }), null);
  assert.deepEqual(serviceAreaOf({ serviceAreaLabel: "Rouen", serviceAreaLatitude: 49.4431, serviceAreaLongitude: 1.0993, serviceAreaRadiusKm: 30 }), rouen);
});
