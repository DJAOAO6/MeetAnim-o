import { test } from "node:test";
import assert from "node:assert/strict";
import { decryptCalendarToken, encryptCalendarToken } from "../src/lib/calendar/calendar-encryption";

// Clé de test dédiée, jamais la vraie — resolveKey() relit process.env à
// chaque appel (à l'intérieur des fonctions testées ci-dessous, jamais au
// chargement du module), donc l'affecter ici avant les tests suffit même
// après l'import statique.
process.env.CALENDAR_TOKEN_ENCRYPTION_KEY = "test-only-encryption-key-never-use-in-prod";

test("encryptCalendarToken puis decryptCalendarToken retrouve le texte d'origine", () => {
  const plain = "ya29.a0AfH6SMC-example-refresh-token-value";
  const encrypted = encryptCalendarToken(plain);
  assert.notEqual(encrypted, plain);
  assert.equal(decryptCalendarToken(encrypted), plain);
});

test("deux chiffrements du même texte produisent des résultats différents (IV aléatoire)", () => {
  const plain = "same-token-value";
  const first = encryptCalendarToken(plain);
  const second = encryptCalendarToken(plain);
  assert.notEqual(first, second);
  assert.equal(decryptCalendarToken(first), plain);
  assert.equal(decryptCalendarToken(second), plain);
});

test("un payload chiffré altéré échoue à se déchiffrer (authentification GCM)", () => {
  const encrypted = encryptCalendarToken("valeur-sensible");
  const [iv, authTag, data] = encrypted.split(".");
  const tampered = [iv, authTag, `${data.slice(0, -2)}xx`].join(".");
  assert.throws(() => decryptCalendarToken(tampered));
});

test("un payload mal formé (pas assez de segments) lève une erreur explicite", () => {
  assert.throws(() => decryptCalendarToken("not-a-valid-payload"));
});
