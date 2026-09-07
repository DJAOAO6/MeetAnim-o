import { test } from "node:test";
import assert from "node:assert/strict";
import { hsvToHex, hexToHsv } from "../src/components/documents/editor/color-math";

test("hsvToHex produit les couleurs de référence pures (rouge/vert/bleu/blanc/noir)", () => {
  assert.equal(hsvToHex(0, 100, 100), "#ff0000");
  assert.equal(hsvToHex(120, 100, 100), "#00ff00");
  assert.equal(hsvToHex(240, 100, 100), "#0000ff");
  assert.equal(hsvToHex(0, 0, 100), "#ffffff");
  assert.equal(hsvToHex(0, 0, 0), "#000000");
});

test("hexToHsv retrouve la teinte/saturation/valeur des couleurs de référence", () => {
  const red = hexToHsv("#ff0000");
  assert.equal(red.h, 0);
  assert.equal(red.s, 100);
  assert.equal(red.v, 100);

  const green = hexToHsv("#00ff00");
  assert.equal(green.h, 120);
  assert.equal(green.s, 100);
  assert.equal(green.v, 100);

  const blue = hexToHsv("#0000ff");
  assert.equal(blue.h, 240);
  assert.equal(blue.s, 100);
  assert.equal(blue.v, 100);

  const white = hexToHsv("#ffffff");
  assert.equal(white.s, 0);
  assert.equal(white.v, 100);

  const black = hexToHsv("#000000");
  assert.equal(black.v, 0);
});

test("aller-retour hsvToHex puis hexToHsv reste cohérent pour une teinte arbitraire", () => {
  const hex = hsvToHex(280, 65, 80);
  const back = hexToHsv(hex);
  // Tolérance : l'arrondi en entier 0-255 lors de la conversion en hex perd
  // un peu de précision, l'aller-retour ne peut pas être exact au bit près.
  assert.ok(Math.abs(back.h - 280) < 2, `hue attendu ~280, obtenu ${back.h}`);
  assert.ok(Math.abs(back.s - 65) < 2, `saturation attendue ~65, obtenue ${back.s}`);
  assert.ok(Math.abs(back.v - 80) < 2, `valeur attendue ~80, obtenue ${back.v}`);
});
