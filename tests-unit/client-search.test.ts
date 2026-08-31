import { test } from "node:test";
import assert from "node:assert/strict";
import { buildClientNameWordConditions, clientSearchQuerySchema, MAX_SEARCH_RESULTS_PER_GROUP } from "../src/lib/client-search";

test("clientSearchQuerySchema rejette une chaîne trop courte", () => {
  assert.equal(clientSearchQuerySchema.safeParse("r").success, false);
  assert.equal(clientSearchQuerySchema.safeParse("").success, false);
});

test("clientSearchQuerySchema trim avant de valider la longueur minimale", () => {
  const result = clientSearchQuerySchema.safeParse("  ro  ");
  assert.equal(result.success, true);
  if (result.success) assert.equal(result.data, "ro");
});

test("clientSearchQuerySchema rejette une chaîne excessivement longue", () => {
  assert.equal(clientSearchQuerySchema.safeParse("a".repeat(101)).success, false);
  assert.equal(clientSearchQuerySchema.safeParse("a".repeat(100)).success, true);
});

test("buildClientNameWordConditions produit une condition ET par mot", () => {
  const conditions = buildClientNameWordConditions("camille test");
  assert.equal(conditions.length, 2);
});

test("buildClientNameWordConditions ignore les espaces multiples", () => {
  const conditions = buildClientNameWordConditions("camille   test");
  assert.equal(conditions.length, 2);
});

test("buildClientNameWordConditions cherche chaque mot sur prénom, nom, téléphone et ville", () => {
  const [condition] = buildClientNameWordConditions("camille");
  const fields = condition.OR.map((entry) => Object.keys(entry)[0]);
  assert.deepEqual(fields, ["firstName", "lastName", "phone", "city"]);
  assert.equal(condition.OR[0].firstName.contains, "camille");
  assert.equal(condition.OR[0].firstName.mode, "insensitive");
});

test("buildClientNameWordConditions produit une seule condition pour un seul mot", () => {
  const conditions = buildClientNameWordConditions("rouen");
  assert.equal(conditions.length, 1);
});

test("MAX_SEARCH_RESULTS_PER_GROUP borne les résultats à 5 par groupe", () => {
  assert.equal(MAX_SEARCH_RESULTS_PER_GROUP, 5);
});
