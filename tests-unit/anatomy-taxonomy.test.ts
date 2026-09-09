import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ANATOMY_BY_SPECIES,
  anatomyPath,
  findAnatomyNode,
  flattenAnatomy,
  searchAnatomy,
  selectableAnatomyNodes,
} from "../src/lib/anatomy/taxonomy";

test("tous les identifiants anatomiques sont uniques", () => {
  const ids = flattenAnatomy(ANATOMY_BY_SPECIES.dog).map((node) => node.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("chaque identifiant est préfixé par son parent — l'arbre est cohérent", () => {
  for (const node of flattenAnatomy(ANATOMY_BY_SPECIES.dog)) {
    for (const child of node.children ?? []) {
      assert.ok(child.id.startsWith(`${node.id}.`), `${child.id} n'est pas sous ${node.id}`);
    }
  }
});

test("la formule vertébrale du chien est respectée (C7, T13, L7)", () => {
  const segment = (id: string) => findAnatomyNode(id)?.children ?? [];
  assert.equal(segment("dog.spine.cervical").length, 7);
  assert.equal(segment("dog.spine.thoracic").length, 13);
  assert.equal(segment("dog.spine.lumbar").length, 7);
});

test("C1 et C2 portent leur nom usuel", () => {
  assert.equal(findAnatomyNode("dog.spine.cervical.c1")?.label, "C1 (Atlas)");
  assert.equal(findAnatomyNode("dog.spine.cervical.c2")?.label, "C2 (Axis)");
});

test("les structures paires existent des deux côtés, la structure médiane une seule fois", () => {
  assert.ok(findAnatomyNode("dog.hindlimb.left.knee"));
  assert.ok(findAnatomyNode("dog.hindlimb.right.knee"));
  assert.ok(findAnatomyNode("dog.pelvis"));
  // Le bassin est médian : jamais dupliqué par côté (ce serait faux).
  assert.equal(findAnatomyNode("dog.hindlimb.left.pelvis"), null);
});

test("le côté est porté par le nœud et reflété dans le libellé", () => {
  const knee = findAnatomyNode("dog.hindlimb.left.knee");
  assert.equal(knee?.side, "left");
  assert.equal(knee?.label, "Genou gauche");
  assert.equal(knee?.shortLabel, "Genou");
});

test("anatomyPath donne le fil d'Ariane complet", () => {
  const path = anatomyPath("dog.spine.lumbar.l5").map((node) => node.label);
  assert.deepEqual(path, ["Chien", "Rachis", "Lombaires", "L5"]);
});

test("anatomyPath rend [] pour un identifiant inconnu au lieu de lever", () => {
  assert.deepEqual(anatomyPath("dog.inexistant"), []);
});

test("la recherche ignore accents et casse", () => {
  const ids = searchAnatomy("dog", "GENOU").map((node) => node.id);
  assert.ok(ids.includes("dog.hindlimb.left.knee"));
  assert.ok(ids.includes("dog.hindlimb.right.knee"));
});

test("la recherche trouve par synonyme vétérinaire", () => {
  const grasset = searchAnatomy("dog", "grasset").map((node) => node.id);
  assert.ok(grasset.includes("dog.hindlimb.left.knee"));

  const omoplate = searchAnatomy("dog", "omoplate").map((node) => node.id);
  assert.ok(omoplate.includes("dog.forelimb.left.scapula"));

  const jarret = searchAnatomy("dog", "jarret").map((node) => node.id);
  assert.ok(jarret.includes("dog.hindlimb.left.tarsus"));
});

test("la recherche privilégie une correspondance en début de libellé", () => {
  const results = searchAnatomy("dog", "sacrum");
  assert.equal(results[0]?.id, "dog.spine.sacrum");
});

test("la recherche rend [] pour une requête vide", () => {
  assert.deepEqual(searchAnatomy("dog", "   "), []);
});

test("la recherche respecte la limite demandée", () => {
  assert.ok(searchAnatomy("dog", "c", 3).length <= 3);
});

test("la racine de l'espèce n'est pas une zone sélectionnable", () => {
  const ids = selectableAnatomyNodes("dog").map((node) => node.id);
  assert.ok(!ids.includes("dog"));
  assert.ok(ids.includes("dog.spine.sacrum"));
});

test("les charnières ostéopathiques clés sont présentes", () => {
  for (const id of ["dog.spine.occiput_c1", "dog.spine.c7_t1", "dog.spine.t13_l1", "dog.spine.l7_s1"]) {
    assert.ok(findAnatomyNode(id), `${id} manquant`);
  }
});
