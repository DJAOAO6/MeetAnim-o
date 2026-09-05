import { test } from "node:test";
import assert from "node:assert/strict";
import { createEmptyDocumentContent } from "../src/lib/documents/content";
import { DEFAULT_MARKER_PRESETS, colorForPreset, labelForPreset } from "../src/lib/documents/marker-presets";
import { dogDiagramDataUri, DOG_DIAGRAM_VIEWBOX } from "../src/lib/documents/dog-diagram";

test("createEmptyDocumentContent produit un contenu A4 portrait valide avec une page vide", () => {
  const content = createEmptyDocumentContent();
  assert.equal(content.formatVersion, 1);
  assert.equal(content.pageSize, "A4_PORTRAIT");
  assert.equal(content.pages.length, 1);
  assert.deepEqual(content.pages[0].elements, []);
});

test("le contenu d'un document survit à un aller-retour JSON (contentJson en base)", () => {
  const content = createEmptyDocumentContent("A4_LANDSCAPE");
  content.pages[0].elements.push({ id: "el-1", type: "text", x: 10, y: 20, width: 100, height: 30, rotation: 0, html: "<p>Test</p>" });
  const roundTripped = JSON.parse(JSON.stringify(content));
  assert.deepEqual(roundTripped, content);
});

test("colorForPreset/labelForPreset retrouvent le préréglage par défaut correspondant", () => {
  assert.equal(labelForPreset("restriction", DEFAULT_MARKER_PRESETS), "Restriction");
  assert.equal(colorForPreset("restriction", DEFAULT_MARKER_PRESETS), "#d1554f");
});

test("colorForPreset/labelForPreset ne lèvent jamais d'exception pour un id inconnu", () => {
  assert.equal(labelForPreset("inconnu", DEFAULT_MARKER_PRESETS), "inconnu");
  assert.equal(colorForPreset("inconnu", DEFAULT_MARKER_PRESETS), "#183b45");
});

test("dogDiagramDataUri produit un data URI SVG bien formé, décodable", () => {
  const uri = dogDiagramDataUri();
  assert.match(uri, /^data:image\/svg\+xml;utf8,/);
  const decoded = decodeURIComponent(uri.replace("data:image/svg+xml;utf8,", ""));
  assert.match(decoded, /^<svg /);
  assert.match(decoded, new RegExp(`viewBox="0 0 ${DOG_DIAGRAM_VIEWBOX.width} ${DOG_DIAGRAM_VIEWBOX.height}"`));
  assert.match(decoded, /<\/svg>$/);
});
