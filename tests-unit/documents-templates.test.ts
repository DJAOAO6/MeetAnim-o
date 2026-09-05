import { test } from "node:test";
import assert from "node:assert/strict";
import { pickDefaultTemplate } from "../src/lib/documents/templates";
import type { StudioDocumentTemplateSummary } from "../src/data/documents";

const templates: StudioDocumentTemplateSummary[] = [
  { id: "t-classic", name: "Compte rendu classique", species: null, thumbnail: null, isBuiltIn: true },
  { id: "t-dog", name: "Compte rendu chien", species: "Chien", thumbnail: null, isBuiltIn: true },
];

test("pickDefaultTemplate choisit le modèle dont l'espèce correspond exactement", () => {
  assert.equal(pickDefaultTemplate("Chien", templates)?.id, "t-dog");
});

test("pickDefaultTemplate retombe sur le modèle générique (species: null) si aucune espèce ne correspond", () => {
  assert.equal(pickDefaultTemplate("Chat", templates)?.id, "t-classic");
  assert.equal(pickDefaultTemplate(null, templates)?.id, "t-classic");
  assert.equal(pickDefaultTemplate(undefined, templates)?.id, "t-classic");
});

test("pickDefaultTemplate retourne null (jamais un modèle au hasard) sans aucun modèle générique disponible", () => {
  const dogOnly = templates.filter((template) => template.species === "Chien");
  assert.equal(pickDefaultTemplate("Chat", dogOnly), null);
  assert.equal(pickDefaultTemplate(null, []), null);
});
