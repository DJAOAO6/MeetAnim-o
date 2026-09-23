import { strict as assert } from "node:assert";
import { test } from "node:test";
import { firstFreeSlug, slugProblem, toSlug } from "../src/lib/slug";

test("un nom devient un lien lisible, sans accent", () => {
  assert.equal(toSlug("Élodie Martin"), "elodie-martin");
  assert.equal(toSlug("  Cœur d’Ostéo — Rouen  "), "coeur-d-osteo-rouen");
  assert.equal(toSlug("---"), "");
});

test("un lien trop long est coupé sans tiret final", () => {
  const slug = toSlug(`${"a".repeat(59)} b`);
  assert.equal(slug.length <= 60, true);
  assert.equal(slug.endsWith("-"), false);
});

test("seule une forme stricte est acceptée", () => {
  assert.equal(slugProblem("elodie-martin"), null);
  assert.match(slugProblem("el") ?? "", /au moins/);
  assert.match(slugProblem("Élodie") ?? "", /minuscules/);
  assert.match(slugProblem("elodie--martin") ?? "", /minuscules/);
  assert.match(slugProblem("-elodie") ?? "", /minuscules/);
  assert.match(slugProblem("a".repeat(61)) ?? "", /dépasser/);
});

test("un lien déjà pris reçoit un numéro", async () => {
  const taken = new Set(["elodie-martin", "elodie-martin-2"]);
  assert.equal(await firstFreeSlug("Élodie Martin", async (slug) => taken.has(slug)), "elodie-martin-3");
  assert.equal(await firstFreeSlug("Jo", async () => false), "cabinet-jo");
  assert.equal(await firstFreeSlug("", async () => false), "cabinet");
});
