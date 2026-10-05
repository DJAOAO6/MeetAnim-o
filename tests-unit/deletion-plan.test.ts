import { test } from "node:test";
import assert from "node:assert/strict";
import { ORGANIZATION_TABLES, OTHER_TABLES, USER_TABLES, organizationHash, purgeAllowed, rateLimitKeysFor, slugHash } from "../src/lib/deletion-plan";
import { pseudonymize } from "../src/lib/privacy";
import { csvCell, toCsv } from "../src/lib/csv-export";

/**
 * Plan de purge d'un espace (chantier C9, phase 3) : ce qui est purgé, dans
 * quel ordre, et les garde-fous.
 */

test("la purge n'est permise qu'en production ou sur une base de test", () => {
  assert.equal(purgeAllowed({ NODE_ENV: "production", DATABASE_URL: "postgresql://u@h/prod" }), true);
  assert.equal(purgeAllowed({ NODE_ENV: "development", DATABASE_URL: "postgresql://u:p@localhost:5432/animeo_test" }), true);
  assert.equal(purgeAllowed({ NODE_ENV: "development", DATABASE_URL: "postgresql://u:p@localhost:5432/animeo_dev" }), false);
  assert.equal(purgeAllowed({ NODE_ENV: "test", DATABASE_URL: "pas une url" }), false);
  assert.equal(purgeAllowed({ NODE_ENV: "development", DATABASE_URL: "postgresql://u@h/animeo_dev", ALLOW_ORGANIZATION_PURGE: "1" }), true);
});

test("ordre : les enfants avant leurs parents, les documents avant leurs auteurs", () => {
  const order = (table: string) => ORGANIZATION_TABLES.indexOf(table as (typeof ORGANIZATION_TABLES)[number]);
  for (const [child, parent] of [
    ["AppointmentCalendarEvent", "Appointment"], ["TourStop", "TourRun"], ["TourRun", "SavedPlace"], ["Reminder", "Animal"],
    ["Consultation", "Animal"], ["AnimalDocument", "Animal"], ["StudioDocument", "Appointment"], ["Animal", "Client"],
    ["Animal", "AnimalPlace"], ["Client", "ClientImport"], ["City", "Zone"], ["Tour", "Zone"],
  ]) {
    assert.ok(order(child) < order(parent), `${child} avant ${parent}`);
  }
  // Les comptes et l'espace en dernier.
  assert.deepEqual(OTHER_TABLES.slice(-2), ["User", "Organization"]);
  assert.equal(new Set([...ORGANIZATION_TABLES, ...USER_TABLES, ...OTHER_TABLES]).size, ORGANIZATION_TABLES.length + USER_TABLES.length + OTHER_TABLES.length);
});

test("les clés de limitation d'un espace sont retrouvées, en empreinte comme en clair", () => {
  const keys = rateLimitKeysFor(["Camille@Example.fr"], ["user-1"]);
  assert.ok(keys.includes(`login:${pseudonymize("camille@example.fr")}`));
  assert.ok(keys.includes(`public-booking:email:${pseudonymize("camille@example.fr")}`));
  assert.ok(keys.includes("reset:camille@example.fr"), "ancienne forme, antérieure aux empreintes");
  assert.ok(keys.includes("client-import:user-1"));
});

test("les empreintes d'un DeletionRecord ne contiennent ni l'identifiant ni le lien", () => {
  const hash = organizationHash("org-cuid-123");
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.ok(!hash.includes("org-cuid-123"));
  assert.equal(organizationHash("org-cuid-123"), hash, "stable : sert à rejouer la purge après une restauration");
  assert.ok(!slugHash("pauline-faucillon").includes("pauline"));
  assert.notEqual(slugHash("pauline-faucillon"), slugHash("pauline-faucillon-2"));
});

test("CSV de l'export : séparateur « ; », guillemets, BOM pour le tableur", () => {
  assert.equal(csvCell('Dupont; "Jean"'), '"Dupont; ""Jean"""');
  assert.equal(csvCell(null), "");
  assert.equal(toCsv(["Nom", "Ville"], [["Rex", "Rouen"]]), "﻿Nom;Ville\r\nRex;Rouen\r\n");
});
