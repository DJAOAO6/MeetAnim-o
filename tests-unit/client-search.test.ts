import { test } from "node:test";
import assert from "node:assert/strict";
import { clientSearchQuerySchema, MAX_SEARCH_RESULTS_PER_GROUP, rankClientsAndAnimals } from "../src/lib/client-search";

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

const people = [
  { id: "c1", firstName: "Hélène", lastName: "Dupont", phone: "0612345678", city: "Rouen", animals: [{ id: "a1", name: "Mirsa" }] },
  { id: "c2", firstName: "Camille", lastName: "Test", phone: "", city: "Le Havre", animals: [] },
];

test("même classement que l'en-tête : accents, fautes, ville", () => {
  assert.deepEqual(rankClientsAndAnimals("helene", people).clients.map((entry) => entry.client.id), ["c1"]);
  assert.deepEqual(rankClientsAndAnimals("havre", people).clients.map((entry) => entry.client.id), ["c2"]);
  // Approchant, faute de groupe dédié sur ces écrans : à la suite des franches.
  assert.deepEqual(rankClientsAndAnimals("mirza", people).animals.map((entry) => entry.animal.id), ["a1"]);
});

test("au plus cinq résultats par groupe", () => {
  const many = Array.from({ length: 12 }, (_, index) => ({ id: `d${index}`, firstName: "Jean", lastName: `Durand${index}`, phone: "", city: "", animals: [] }));
  assert.equal(rankClientsAndAnimals("durand", many).clients.length, MAX_SEARCH_RESULTS_PER_GROUP);
});
