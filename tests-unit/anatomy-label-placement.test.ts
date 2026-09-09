import { test } from "node:test";
import assert from "node:assert/strict";
import { placeAnatomyLabels, type LabelCandidate, type LabelPlacementOptions } from "../src/lib/anatomy/label-placement";

const options: LabelPlacementOptions = {
  viewBox: { width: 1000, height: 560 },
  labelHeight: 34,
  minGap: 8,
  padding: 12,
};

const step = options.labelHeight + options.minGap;

function candidate(id: string, x: number, y: number): LabelCandidate {
  return { id, anchor: { x, y }, title: id, color: "#2f7a6e" };
}

test("un libellé isolé reste à la hauteur de sa zone", () => {
  const [placed] = placeAnatomyLabels([candidate("a", 200, 300)], options);
  assert.equal(placed.y, 300);
});

test("une zone avant va à gauche, une zone arrière à droite", () => {
  const placed = placeAnatomyLabels([candidate("avant", 120, 200), candidate("arriere", 880, 200)], options);
  assert.equal(placed.find((label) => label.id === "avant")?.side, "left");
  assert.equal(placed.find((label) => label.id === "arriere")?.side, "right");
});

test("deux libellés trop proches sont écartés d'au moins labelHeight + minGap", () => {
  const placed = placeAnatomyLabels([candidate("a", 200, 300), candidate("b", 200, 310)], options);
  const ys = placed.map((label) => label.y).sort((a, b) => a - b);
  assert.ok(ys[1] - ys[0] >= step - 0.001, `écart insuffisant : ${ys[1] - ys[0]}`);
});

test("l'ordre vertical des zones est préservé — sinon les lignes se croiseraient", () => {
  const placed = placeAnatomyLabels(
    [candidate("haut", 200, 100), candidate("milieu", 200, 110), candidate("bas", 200, 120)],
    options,
  );
  const byId = new Map(placed.map((label) => [label.id, label.y]));
  assert.ok(byId.get("haut")! < byId.get("milieu")!);
  assert.ok(byId.get("milieu")! < byId.get("bas")!);
});

test("une grappe basse ne pousse aucun libellé hors du cadre", () => {
  const crowded = Array.from({ length: 6 }, (_, index) => candidate(`z${index}`, 200, 540 + index));
  const placed = placeAnatomyLabels(crowded, options);
  const maxY = options.viewBox.height - options.padding - options.labelHeight / 2;
  const minY = options.padding + options.labelHeight / 2;
  for (const label of placed) {
    assert.ok(label.y <= maxY + 0.001, `${label.id} déborde en bas (${label.y})`);
    assert.ok(label.y >= minY - 0.001, `${label.id} déborde en haut (${label.y})`);
  }
});

test("une grappe haute ne pousse aucun libellé au-dessus du cadre", () => {
  const crowded = Array.from({ length: 6 }, (_, index) => candidate(`z${index}`, 200, index));
  const placed = placeAnatomyLabels(crowded, options);
  const minY = options.padding + options.labelHeight / 2;
  for (const label of placed) assert.ok(label.y >= minY - 0.001, `${label.id} déborde en haut (${label.y})`);
});

test("les deux colonnes sont résolues indépendamment", () => {
  // Trois zones à gauche empilées ne doivent pas décaler celle de droite.
  const placed = placeAnatomyLabels(
    [candidate("g1", 100, 200), candidate("g2", 100, 205), candidate("g3", 100, 210), candidate("d1", 900, 200)],
    options,
  );
  assert.equal(placed.find((label) => label.id === "d1")?.y, 200);
});

test("saturer le cadre ne lève pas et garde tout dans les bornes", () => {
  const many = Array.from({ length: 40 }, (_, index) => candidate(`z${index}`, 200, 280));
  const placed = placeAnatomyLabels(many, options);
  assert.equal(placed.length, 40);
  const minY = options.padding + options.labelHeight / 2;
  const maxY = options.viewBox.height - options.padding - options.labelHeight / 2;
  for (const label of placed) {
    assert.ok(label.y >= minY - 0.001 && label.y <= maxY + 0.001, `${label.id} hors bornes (${label.y})`);
  }
});

test("aucun libellé n'est perdu en route", () => {
  const input = [candidate("a", 100, 100), candidate("b", 900, 100), candidate("c", 500, 400)];
  const placed = placeAnatomyLabels(input, options);
  assert.deepEqual(placed.map((label) => label.id).sort(), ["a", "b", "c"]);
});

test("une liste vide rend une liste vide", () => {
  assert.deepEqual(placeAnatomyLabels([], options), []);
});
