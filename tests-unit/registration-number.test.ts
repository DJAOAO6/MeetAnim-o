import { test } from "node:test";
import assert from "node:assert/strict";
import {
  REGISTRATION_NUMBER_LOCKED_ERROR,
  REGISTRATION_NUMBER_REQUIRED_ERROR,
  normalizeRegistrationNumber,
  registrationNumberProblem,
  registrationNumberState,
  requiresRna,
} from "../src/lib/registration-number";

test("seul un ostéopathe doit donner un numéro RNA, quelle que soit l'écriture", () => {
  for (const profession of ["Ostéopathe animalier", "ostéopathe équin", "OSTEOPATHE", "Ostéopathie animale"]) assert.equal(requiresRna(profession), true, profession);
  for (const profession of ["Comportementaliste", "Éducateur canin", "Toiletteur", "", "Masseur canin"]) assert.equal(requiresRna(profession), false, profession);
  assert.equal(requiresRna(null), false);
});

test("le numéro se compare en majuscules et sans espaces", () => {
  assert.equal(normalizeRegistrationNumber(" oa 19 51 "), "OA1951");
  assert.equal(normalizeRegistrationNumber(null), "");
});

test("numéro obligatoire pour un ostéopathe tant que l'espace n'est pas vérifié", () => {
  const base = { profession: "Ostéopathe animalier", current: null };
  assert.equal(registrationNumberProblem({ ...base, next: "  ", status: "NOT_REQUIRED" }), REGISTRATION_NUMBER_REQUIRED_ERROR);
  assert.equal(registrationNumberProblem({ ...base, next: "", status: "REJECTED" }), REGISTRATION_NUMBER_REQUIRED_ERROR);
  assert.equal(registrationNumberProblem({ ...base, next: "OA1951", status: "NOT_REQUIRED" }), null);
  // Un comportementaliste n'en a pas besoin.
  assert.equal(registrationNumberProblem({ profession: "Comportementaliste", current: null, next: null, status: "NOT_REQUIRED" }), null);
  // Un espace existant, vérifié par la migration sans numéro, n'est pas bloqué.
  assert.equal(registrationNumberProblem({ ...base, next: null, status: "VERIFIED" }), null);
});

test("un numéro vérifié est figé ; un espace vérifié sans numéro peut le saisir une fois", () => {
  const verified = { profession: "Ostéopathe animalier", status: "VERIFIED" as const };
  assert.equal(registrationNumberProblem({ ...verified, current: "OA1951", next: "OA1952" }), REGISTRATION_NUMBER_LOCKED_ERROR);
  assert.equal(registrationNumberProblem({ ...verified, current: "OA1951", next: null }), REGISTRATION_NUMBER_LOCKED_ERROR);
  // Même numéro, autre écriture : rien ne change.
  assert.equal(registrationNumberProblem({ ...verified, current: "OA1951", next: "oa 1951" }), null);
  assert.equal(registrationNumberProblem({ ...verified, current: null, next: "OA1951" }), null);
  // En attente, il se corrige encore.
  assert.equal(registrationNumberProblem({ profession: "Ostéopathe animalier", status: "PENDING", current: "OA1951", next: "OA1952" }), null);

  assert.equal(registrationNumberState("VERIFIED", "OA1951"), "locked");
  assert.equal(registrationNumberState("VERIFIED", null), "once");
  assert.equal(registrationNumberState("NOT_REQUIRED", null), "toVerify");
  assert.equal(registrationNumberState("PENDING", "OA1951"), "toVerify");
});
