import { test } from "node:test";
import assert from "node:assert/strict";
import { maskEmail, pseudonymize, rateLimitKey, redactEmails } from "../src/lib/privacy";
import {
  accountChangeMetadata,
  accountDeletedMetadata,
  animalDeletedMetadata,
  calendarConnectedMetadata,
  invitationSentMetadata,
  loginFailedMetadata,
} from "../src/lib/audit-metadata";

/**
 * Données personnelles hors de l'espace (chantier C9, phase 2) : ni le
 * journal d'audit ni les clés de limitation de débit ne gardent une adresse,
 * un nom ou un prénom en clair.
 */

const EMAIL = "Camille.Dupont@example.fr";

test("aucune métadonnée d'audit ne contient d'adresse email ni de nom", () => {
  const before = { firstName: "Camille", lastName: "Dupont", email: "camille@example.fr" };
  const after = { firstName: "Camille", lastName: "Durand", email: "camille.durand@example.fr" };
  const all = [
    loginFailedMetadata(EMAIL),
    accountChangeMetadata(before, after),
    accountDeletedMetadata(),
    invitationSentMetadata(true),
    calendarConnectedMetadata(),
    animalDeletedMetadata("client-1"),
  ];
  for (const metadata of all) {
    const text = JSON.stringify(metadata);
    assert.ok(!text.includes("@"), `pas d'adresse : ${text}`);
    assert.ok(!/Camille|Dupont|Durand/i.test(text), `pas de nom : ${text}`);
  }
  // Ce qui a changé reste lisible, sans les valeurs.
  assert.deepEqual(accountChangeMetadata(before, after), { changed: ["lastName", "email"] });
});

test("la clé de limitation de débit ne contient pas l'email, et reste stable pour une même adresse", () => {
  const key = rateLimitKey("login", EMAIL);
  assert.ok(key.startsWith("login:"));
  assert.ok(!key.includes("@") && !/camille|dupont|example/i.test(key), key);
  // Casse et espaces ne changent rien : les tentatives se comptent ensemble.
  assert.equal(rateLimitKey("login", "  camille.dupont@EXAMPLE.fr "), key);
  assert.notEqual(rateLimitKey("login", "autre@example.fr"), key);
  assert.ok(!rateLimitKey("login:ip", "203.0.113.7").includes("203.0.113.7"));
});

test("l'empreinte dépend du secret du serveur", () => {
  assert.notEqual(pseudonymize(EMAIL, "secret-a"), pseudonymize(EMAIL, "secret-b"));
  assert.equal(pseudonymize(EMAIL, "secret-a"), pseudonymize(EMAIL.toLowerCase(), "secret-a"));
  assert.equal(loginFailedMetadata(EMAIL).emailHash, pseudonymize(EMAIL));
});

test("masquage pour les journaux", () => {
  assert.equal(maskEmail("camille@example.fr"), "c•••@example.fr");
  assert.equal(maskEmail("pas-une-adresse"), "[adresse masquée]");
  assert.equal(
    redactEmails(`Mailjet 400 : {"To":[{"Email":"camille@example.fr"}],"Errors":"invalid"}`),
    `Mailjet 400 : {"To":[{"Email":"[adresse masquée]"}],"Errors":"invalid"}`,
  );
});
