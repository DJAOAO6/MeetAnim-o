import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSingleStopMapsUrl, buildTourMapsLinks } from "../src/lib/tour-maps";
import type { Coordinates } from "../src/data/tours";

const cabinet: Coordinates = { lat: 49.44, lng: 1.1 };

function stopAt(lat: number, lng: number) {
  return { coordinates: { lat, lng } as Coordinates };
}

test("cas nominal : cabinet en origine, dernier arrêt en destination, arrêts intermédiaires en waypoints", () => {
  const stops = [stopAt(49.9, 1.08), stopAt(49.5, 0.19), stopAt(49.22, 1.17)];
  const result = buildTourMapsLinks(cabinet, stops);

  assert.equal(result.excludedStopCount, 0);
  assert.equal(result.links.length, 1);
  assert.equal(result.links[0].label, "Itinéraire complet");

  const url = new URL(result.links[0].url);
  assert.equal(url.searchParams.get("api"), "1");
  assert.equal(url.searchParams.get("origin"), "49.44,1.1");
  assert.equal(url.searchParams.get("destination"), "49.22,1.17");
  assert.equal(url.searchParams.get("waypoints"), "49.9,1.08|49.5,0.19");
  assert.equal(url.searchParams.get("travelmode"), "driving");
});

test("sans cabinet géocodé : l'itinéraire part du premier arrêt localisé", () => {
  const stops = [stopAt(49.9, 1.08), stopAt(49.5, 0.19), stopAt(49.22, 1.17)];
  const result = buildTourMapsLinks(null, stops);

  const url = new URL(result.links[0].url);
  assert.equal(url.searchParams.get("origin"), "49.9,1.08");
  assert.equal(url.searchParams.get("destination"), "49.22,1.17");
  assert.equal(url.searchParams.get("waypoints"), "49.5,0.19");
});

test("un arrêt sans coordonnées est exclu et compté, jamais positionné au hasard", () => {
  const stops = [stopAt(49.9, 1.08), { coordinates: null }, stopAt(49.22, 1.17)];
  const result = buildTourMapsLinks(cabinet, stops);

  assert.equal(result.excludedStopCount, 1);
  const url = new URL(result.links[0].url);
  assert.equal(url.searchParams.has("waypoints"), true);
  assert.equal(url.searchParams.get("waypoints"), "49.9,1.08");
});

test("moins de 2 arrêts localisés : aucun lien (bouton masqué)", () => {
  assert.deepEqual(buildTourMapsLinks(cabinet, []), { links: [], excludedStopCount: 0 });
  assert.deepEqual(buildTourMapsLinks(cabinet, [stopAt(49.9, 1.08)]), { links: [], excludedStopCount: 0 });
  assert.deepEqual(buildTourMapsLinks(null, [stopAt(49.9, 1.08)]), { links: [], excludedStopCount: 0 });
});

test("buildSingleStopMapsUrl ne fixe que la destination, l'origine reste la position actuelle dans Maps", () => {
  const url = new URL(buildSingleStopMapsUrl(cabinet));
  assert.equal(url.searchParams.get("destination"), "49.44,1.1");
  assert.equal(url.searchParams.has("origin"), false);
  assert.equal(url.searchParams.get("travelmode"), "driving");
});

test("plus de 9 waypoints : découpe en plusieurs liens qui s'enchaînent, jamais de troncature silencieuse", () => {
  // Cabinet + 12 arrêts localisés = 13 points de trajet ; 11 points max par
  // lien (origine + 9 waypoints + destination) => 2 liens attendus.
  const stops = Array.from({ length: 12 }, (_, index) => stopAt(49 + index * 0.01, 1 + index * 0.01));
  const result = buildTourMapsLinks(cabinet, stops);

  assert.equal(result.excludedStopCount, 0);
  assert.equal(result.links.length, 2);
  assert.equal(result.links[0].label, "Itinéraire 1/2");
  assert.equal(result.links[1].label, "Itinéraire 2/2");

  const firstUrl = new URL(result.links[0].url);
  const secondUrl = new URL(result.links[1].url);
  const firstWaypoints = firstUrl.searchParams.get("waypoints")!.split("|");
  const secondWaypoints = secondUrl.searchParams.get("waypoints")?.split("|") ?? [];

  assert.ok(firstWaypoints.length <= 9);
  assert.ok(secondWaypoints.length <= 9);
  // Le lien 2 reprend comme origine le point où le lien 1 s'est arrêté —
  // aucun arrêt sauté à la jointure.
  assert.equal(firstUrl.searchParams.get("destination"), secondUrl.searchParams.get("origin"));
});
