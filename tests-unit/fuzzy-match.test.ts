import { test } from "node:test";
import assert from "node:assert/strict";
import { editDistance, normalizeForSearch, phoneDigits, scoreMatch, searchPeople, candidateWords } from "../src/lib/fuzzy-match";

const people = [
  { id: "c1", firstName: "Hélène", lastName: "Dupont", phone: "06 12 34 56 78", city: "Rouen", animals: [{ id: "a1", name: "Mirsa", species: "Chat" }, { id: "a2", name: "Rex", species: "Chien" }] },
  { id: "c2", firstName: "Jean-Pierre", lastName: "Lefèvre", phone: "07 98 76 54 32", city: "Le Havre", animals: [{ id: "a3", name: "Tigrou", species: "Chat" }] },
  { id: "c3", firstName: "Œdipe", lastName: "Martin", phone: "+33 6 55 44 33 22", city: "Évreux", animals: [{ id: "a4", name: "Bella", species: "Chat" }] },
  { id: "c4", firstName: "Lucie", lastName: "Dupuis", phone: "", city: "Dieppe", animals: [] },
];

const clientIds = (result: ReturnType<typeof searchPeople>["clients"]) => result.map((entry) => entry.client.id);
const animalIds = (result: ReturnType<typeof searchPeople>["animals"]) => result.map((entry) => entry.animal.id);

test("normalisation : accents, ligatures, tirets et apostrophes", () => {
  assert.equal(normalizeForSearch("  Hélène  D’Arc-Lévêque "), "helene d arc leveque");
  assert.equal(normalizeForSearch("Œdipe Lætitia"), "oedipe laetitia");
  assert.equal(phoneDigits("+33 6 55 44 33 22"), "0655443322");
  assert.equal(phoneDigits("06.12.34.56.78"), "0612345678");
});

test("distance de Damerau-Levenshtein, avec transpositions", () => {
  assert.equal(editDistance("mirza", "mirsa", 2), 1);
  assert.equal(editDistance("dupotn", "dupont", 2), 1, "deux lettres inversées : une seule faute");
  assert.equal(editDistance("abc", "xyz", 1), 2, "arrêtée au-delà du maximum");
});

test("« helene » trouve « Hélène »", () => {
  assert.deepEqual(clientIds(searchPeople("helene", people).clients), ["c1"]);
  assert.deepEqual(clientIds(searchPeople("oedipe", people).clients), ["c3"]);
});

test("« dupon » trouve « Dupont » en premier", () => {
  const result = searchPeople("dupon", people);
  assert.equal(result.clients[0].client.id, "c1");
});

test("« mirza » propose « Mirsa » parmi les résultats approchants", () => {
  const result = searchPeople("mirza", people);
  assert.deepEqual(animalIds(result.animals), []);
  assert.deepEqual(animalIds(result.approximate.animals), ["a1"]);
  assert.equal(result.approximate.animals[0].client.id, "c1", "avec son propriétaire");
});

test("« jean pierre » trouve « Jean-Pierre », dans n'importe quel ordre", () => {
  assert.deepEqual(clientIds(searchPeople("jean pierre", people).clients), ["c2"]);
  assert.deepEqual(clientIds(searchPeople("lefevre jean", people).clients), ["c2"]);
});

test("« 06 12 34 » trouve le bon numéro, et le +33 se compare au 06", () => {
  assert.deepEqual(clientIds(searchPeople("06 12 34", people).clients), ["c1"]);
  assert.deepEqual(clientIds(searchPeople("0655", people).clients), ["c3"]);
  // Un chiffre faux, c'est un autre numéro : pas de résultat « approchant ».
  assert.deepEqual(clientIds(searchPeople("06 12 34 99", people).approximate.clients), []);
});

test("« chat » ne ramène pas tout le monde : l'espèce n'est pas cherchée", () => {
  const result = searchPeople("chat", people);
  assert.deepEqual([...result.clients, ...result.approximate.clients].length, 0);
  assert.deepEqual([...result.animals, ...result.approximate.animals].length, 0);
});

test("un seul caractère : rien", () => {
  const result = searchPeople("d", people);
  assert.equal(result.clients.length + result.animals.length + result.approximate.clients.length + result.approximate.animals.length, 0);
});

test("un animal se cherche par son nom, éventuellement avec son propriétaire", () => {
  assert.deepEqual(animalIds(searchPeople("rex dupont", people).animals), ["a2"]);
  // Chercher le propriétaire ne liste pas ses animaux.
  assert.deepEqual(animalIds(searchPeople("dupont", people).animals), []);
});

test("un mot sans correspondance écarte la fiche ; la ville compte", () => {
  assert.equal(scoreMatch("helene zzzz", candidateWords(["Hélène", "Dupont"])), 0);
  assert.deepEqual(clientIds(searchPeople("evreux", people).clients), ["c3"]);
});

test("les franches d'abord, triées par score puis par nom", () => {
  const result = searchPeople("dup", people);
  assert.deepEqual(clientIds(result.clients), ["c1", "c4"]);
  assert.ok(result.clients.every((entry) => entry.score >= 0.75));
});
