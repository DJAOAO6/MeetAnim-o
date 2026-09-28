import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addDaysToDateId, appointmentsInRange, dayHeading, mapModeParam, matchesVisitFilter, monthsBetween, parseMapMode,
  parseZoneFilter, visitTier, zoneFilterParam, zoneIdsOf,
} from "../src/lib/map-modes";
import type { MapAppointment } from "../src/data/map-clients";
import type { PublicZone } from "../src/data/public-booking";

const appointment = (id: string, dateId: string): MapAppointment => ({
  id, dateId, start: "10:00", clientId: null, clientName: "Client", animalName: "", animalSpecies: null,
  serviceName: "Séance", city: "Rouen", place: "home", status: "CONFIRMED", coordinates: null,
});

test("mode de carte : lu et écrit dans l'adresse, Clients par défaut", () => {
  assert.equal(parseMapMode("activite"), "activity");
  assert.equal(parseMapMode("inconnu"), "clients");
  assert.equal(parseMapMode(null), "clients");
  assert.equal(mapModeParam("clients"), null);
  assert.equal(mapModeParam("tours"), "tournees");
});

test("période d'activité : aujourd'hui inclus, fin de période incluse, passé exclu", () => {
  const list = [appointment("hier", "2026-09-27"), appointment("jour", "2026-09-28"), appointment("j6", "2026-10-04"), appointment("j7", "2026-10-05")];
  assert.deepEqual(appointmentsInRange(list, "2026-09-28", "today").map((item) => item.id), ["jour"]);
  assert.deepEqual(appointmentsInRange(list, "2026-09-28", "7").map((item) => item.id), ["jour", "j6"]);
  assert.deepEqual(appointmentsInRange(list, "2026-09-28", "30").map((item) => item.id), ["jour", "j6", "j7"]);
});

test("jours : changement de mois et intitulés", () => {
  assert.equal(addDaysToDateId("2026-09-30", 1), "2026-10-01");
  assert.equal(dayHeading("2026-09-28", "2026-09-28"), "Aujourd’hui");
  assert.equal(dayHeading("2026-09-29", "2026-09-28"), "Demain");
  assert.equal(dayHeading("2026-09-30", "2026-09-28"), "Mercredi 30 septembre");
});

test("ancienneté de la dernière visite : trois paliers, jamais vu = plus de 12 mois", () => {
  assert.equal(monthsBetween("2026-06-29", "2026-09-28"), 2);
  assert.equal(visitTier("2026-07-01", "2026-09-28"), "recent");
  assert.equal(visitTier("2026-06-28", "2026-09-28"), "mid");
  assert.equal(visitTier("2025-09-29", "2026-09-28"), "mid");
  assert.equal(visitTier("2025-09-28", "2026-09-28"), "old");
  assert.equal(visitTier(null, "2026-09-28"), "old");
  assert.equal(matchesVisitFilter({ dueForReminder: true, lastConsultationAt: "2026-09-01" }, "due", "2026-09-28"), true);
  assert.equal(matchesVisitFilter({ dueForReminder: false, lastConsultationAt: "2026-09-01" }, "old", "2026-09-28"), false);
});

test("zones d'un client : commune, code postal ou secteur ; sinon non rattaché", () => {
  const zones: PublicZone[] = [
    { id: "nord", name: "Nord", cities: ["Yvetot"], postalCodes: ["76190"], tourDays: [], sector: null },
    { id: "rouen", name: "Rouen", cities: [], postalCodes: [], tourDays: [], sector: { lat: 49.443, lng: 1.099, radiusKm: 10 } },
  ];
  assert.deepEqual(zoneIdsOf({ city: "yvetot", postalCode: "", coordinates: null }, zones), ["nord"]);
  assert.deepEqual(zoneIdsOf({ city: "Ailleurs", postalCode: "76190", coordinates: null }, zones), ["nord"]);
  assert.deepEqual(zoneIdsOf({ city: "Mont-Saint-Aignan", postalCode: "76130", coordinates: { lat: 49.463, lng: 1.087 } }, zones), ["rouen"]);
  assert.deepEqual(zoneIdsOf({ city: "Dieppe", postalCode: "76200", coordinates: { lat: 49.92, lng: 1.08 } }, zones), []);
});

test("filtre de zone : aller-retour par l'adresse", () => {
  for (const filter of [{ kind: "none" }, { kind: "zone", id: "z1" }, { kind: "tour", id: "t1" }] as const) {
    assert.deepEqual(parseZoneFilter(zoneFilterParam(filter)), filter);
  }
  assert.equal(parseZoneFilter(null), null);
});
