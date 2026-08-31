import { test } from "node:test";
import assert from "node:assert/strict";
import { toTelHref } from "../src/lib/phone";

test("toTelHref normalise un numéro national avec espaces", () => {
  assert.equal(toTelHref("06 12 34 56 78"), "tel:+33612345678");
});

test("toTelHref normalise un numéro national avec points", () => {
  assert.equal(toTelHref("06.12.34.56.78"), "tel:+33612345678");
});

test("toTelHref normalise un numéro national sans séparateur", () => {
  assert.equal(toTelHref("0612345678"), "tel:+33612345678");
});

test("toTelHref normalise un numéro fixe (01)", () => {
  assert.equal(toTelHref("01 23 45 67 89"), "tel:+33123456789");
});

test("toTelHref accepte un numéro déjà au format international", () => {
  assert.equal(toTelHref("+33612345678"), "tel:+33612345678");
});

test("toTelHref accepte un numéro international avec espaces", () => {
  assert.equal(toTelHref("+33 6 12 34 56 78"), "tel:+33612345678");
});

test("toTelHref retourne null pour une chaîne vide ou blanche", () => {
  assert.equal(toTelHref(""), null);
  assert.equal(toTelHref("   "), null);
});

test("toTelHref retourne null pour un numéro invalide", () => {
  assert.equal(toTelHref("abcdefghij"), null);
  assert.equal(toTelHref("123"), null);
  assert.equal(toTelHref("06 12 34 56"), null);
});
