import { test } from "node:test";
import assert from "node:assert/strict";
import { computeGuides } from "../src/components/documents/editor/smart-guides";

const PAGE = { width: 794, height: 1123 };

test("computeGuides détecte l'alignement au centre de la page (axe X)", () => {
  // Centre page = 397 ; un élément de largeur 100 centré dessus a x = 347.
  const result = computeGuides({ x: 345, y: 60, width: 100, height: 40 }, PAGE, [], 4);
  assert.equal(result.guides.length, 1);
  assert.equal(result.guides[0].orientation, "vertical");
  assert.equal(result.guides[0].position, 397);
  assert.equal(result.x, 347);
});

test("computeGuides détecte l'alignement au bord d'un autre élément (axe Y)", () => {
  const other = { x: 200, y: 300, width: 120, height: 60 };
  // Bord haut de l'autre élément = 300 ; l'élément déplacé est à y=298 (2px d'écart, sous le seuil 4).
  const result = computeGuides({ x: 10, y: 298, width: 50, height: 50 }, PAGE, [other], 4);
  assert.equal(result.guides.length, 1);
  assert.equal(result.guides[0].orientation, "horizontal");
  assert.equal(result.guides[0].position, 300);
  assert.equal(result.y, 300);
});

test("computeGuides ne snappe pas hors du seuil", () => {
  const other = { x: 200, y: 300, width: 120, height: 60 };
  // 20px d'écart, largement hors du seuil de 4px.
  const result = computeGuides({ x: 10, y: 320, width: 50, height: 50 }, PAGE, [other], 4);
  assert.equal(result.guides.length, 0);
  assert.equal(result.x, 10);
  assert.equal(result.y, 320);
});

test("computeGuides retient le candidat le plus proche quand plusieurs sont sous le seuil", () => {
  // Boîtes de largeur/hauteur nulle : les 3 candidats (bord/centre/bord) de
  // chacune se confondent en une seule valeur, ce qui isole sans ambiguïté
  // la propriété testée (le plus proche des deux gagne) de tout effet de
  // bord lié aux 3 candidats par boîte.
  const closer = { x: 103, y: 500, width: 0, height: 0 }; // écart de 3
  const farther = { x: 96, y: 500, width: 0, height: 0 }; // écart de 4
  const result = computeGuides({ x: 100, y: 60, width: 0, height: 0 }, PAGE, [closer, farther], 5);
  assert.equal(result.guides.length, 1);
  assert.equal(result.guides[0].position, 103);
  assert.equal(result.x, 103);
});
