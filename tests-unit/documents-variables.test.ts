import { test } from "node:test";
import assert from "node:assert/strict";
import { labelForVariable, resolveVariable, type DocumentVariableContext } from "../src/lib/documents/variables";

const fullContext: DocumentVariableContext = {
  professional: { company: "PF Ostéo Animale", phone: "06 12 34 56 78", email: "pauline@example.fr", address: "24 rue des Carmes" },
  client: { firstName: "Camille", lastName: "Duboc", phone: "07 00 00 00 00", email: "camille@example.fr", address: "1 rue du Test" },
  animal: { name: "Oslo", species: "Chien", breed: "Labrador", sex: "Mâle", weight: "25 kg", birthDate: "12 mars 2022" },
  appointment: { date: "12 mars 2026", start: "09:00", serviceName: "Ostéopathie", location: "Cabinet" },
};

const emptyContext: DocumentVariableContext = { professional: null, client: null, animal: null, appointment: null };

test("resolveVariable retrouve la valeur réelle pour chaque entité connue", () => {
  assert.equal(resolveVariable("professional.company", fullContext), "PF Ostéo Animale");
  assert.equal(resolveVariable("client.firstName", fullContext), "Camille");
  assert.equal(resolveVariable("animal.name", fullContext), "Oslo");
  assert.equal(resolveVariable("appointment.serviceName", fullContext), "Ostéopathie");
});

test("resolveVariable retourne une chaîne vide (jamais une exception) quand l'entité est absente", () => {
  assert.equal(resolveVariable("client.firstName", emptyContext), "");
  assert.equal(resolveVariable("animal.name", emptyContext), "");
});

test("resolveVariable retourne une chaîne vide pour un token inconnu", () => {
  assert.equal(resolveVariable("inconnu.champ", fullContext), "");
  assert.equal(resolveVariable("animal.inexistant", fullContext), "");
});

test("labelForVariable retrouve le libellé humain de chaque token, et retombe sur le token brut sinon", () => {
  assert.equal(labelForVariable("animal.name"), "Nom de l’animal");
  assert.equal(labelForVariable("client.firstName"), "Prénom du propriétaire");
  assert.equal(labelForVariable("token.inexistant"), "token.inexistant");
});
