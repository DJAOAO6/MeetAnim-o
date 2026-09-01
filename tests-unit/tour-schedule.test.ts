import { test } from "node:test";
import assert from "node:assert/strict";
import { nextOccurrenceDateId, tourRunsOnDate } from "../src/lib/tour-schedule";

test("hebdomadaire sans ancre (tournée créée avant les nouveaux motifs) revient chaque semaine sans condition de date", () => {
  const tour = { day: "Mardi", dateId: undefined, recurrence: "Toutes les semaines" as const };
  assert.equal(tourRunsOnDate(tour, "2020-01-07", "Mardi"), true);
  assert.equal(tourRunsOnDate(tour, "2030-01-01", "Mardi"), true);
  assert.equal(tourRunsOnDate(tour, "2026-09-02", "Mercredi"), false);
});

test("hebdomadaire avec ancre ne revient qu'à partir de la date d'ancrage", () => {
  const tour = { day: "Mardi", dateId: "2026-09-01", recurrence: "Toutes les semaines" as const };
  assert.equal(tourRunsOnDate(tour, "2026-08-25", "Mardi"), false, "avant l'ancre : ne doit pas matcher");
  assert.equal(tourRunsOnDate(tour, "2026-09-01", "Mardi"), true);
  assert.equal(tourRunsOnDate(tour, "2026-09-08", "Mardi"), true);
});

test("une semaine sur deux ne matche que les semaines paires depuis l'ancre", () => {
  const tour = { day: "Jeudi", dateId: "2026-09-03", recurrence: "Toutes les deux semaines" as const };
  assert.equal(tourRunsOnDate(tour, "2026-09-03", "Jeudi"), true, "ancre elle-même");
  assert.equal(tourRunsOnDate(tour, "2026-09-10", "Jeudi"), false, "une semaine après : impaire");
  assert.equal(tourRunsOnDate(tour, "2026-09-17", "Jeudi"), true, "deux semaines après : paire");
  assert.equal(tourRunsOnDate(tour, "2026-09-17", "Vendredi"), false, "bon jour du mois mais mauvais jour de semaine");
});

test("mensuel matche sur le jour du mois, indépendamment du jour de la semaine", () => {
  const tour = { day: "Mardi", dateId: "2026-01-15", recurrence: "Tous les mois" as const };
  // Le 15 février 2026 tombe un dimanche, pas un mardi — doit quand même matcher.
  assert.equal(tourRunsOnDate(tour, "2026-02-15", "Dimanche"), true);
  assert.equal(tourRunsOnDate(tour, "2026-03-15", "Dimanche"), true);
  assert.equal(tourRunsOnDate(tour, "2026-01-16", "Vendredi"), false, "mauvais jour du mois");
  assert.equal(tourRunsOnDate(tour, "2025-12-15", "Lundi"), false, "avant l'ancre");
});

test("ponctuelle ne matche que sa date exacte", () => {
  const tour = { day: "Mardi", dateId: "2026-09-15", recurrence: "Une seule fois" as const };
  assert.equal(tourRunsOnDate(tour, "2026-09-15", "Mardi"), true);
  assert.equal(tourRunsOnDate(tour, "2026-09-22", "Mardi"), false);
});

test("nextOccurrenceDateId retrouve la bonne date pour chaque motif", () => {
  const weekly = { day: "Mardi", dateId: "2026-09-01", recurrence: "Toutes les semaines" as const };
  assert.equal(nextOccurrenceDateId(weekly, "2026-09-01"), "2026-09-01");
  assert.equal(nextOccurrenceDateId(weekly, "2026-09-02"), "2026-09-08");

  const biweekly = { day: "Jeudi", dateId: "2026-09-03", recurrence: "Toutes les deux semaines" as const };
  assert.equal(nextOccurrenceDateId(biweekly, "2026-09-04"), "2026-09-17");

  const monthly = { day: "Mardi", dateId: "2026-01-15", recurrence: "Tous les mois" as const };
  assert.equal(nextOccurrenceDateId(monthly, "2026-02-01"), "2026-02-15");

  const oneOff = { day: "Mardi", dateId: "2026-09-15", recurrence: "Une seule fois" as const };
  assert.equal(nextOccurrenceDateId(oneOff, "2026-09-01"), "2026-09-15");
  assert.equal(nextOccurrenceDateId(oneOff, "2026-09-16"), null, "date ponctuelle passée : plus d'occurrence");
});
