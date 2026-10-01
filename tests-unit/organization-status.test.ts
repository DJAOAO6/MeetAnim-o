import { test } from "node:test";
import assert from "node:assert/strict";
import { OPEN_ORGANIZATION_WHERE, organizationBlockOf, suspendedAccountMessage } from "../src/lib/organization-status";

test("un espace sans suspension ni suppression programmée est ouvert", () => {
  assert.equal(organizationBlockOf({ suspendedAt: null, deletionScheduledFor: null }), null);
  assert.equal(organizationBlockOf(null), null);
});

test("suspension et suppression programmée ferment l'espace ; la suppression prime", () => {
  const date = new Date("2026-10-01T10:00:00Z");
  assert.equal(organizationBlockOf({ suspendedAt: date, deletionScheduledFor: null }), "suspended");
  assert.equal(organizationBlockOf({ suspendedAt: date, deletionScheduledFor: date }), "deletion_scheduled");
  assert.equal(organizationBlockOf({ suspendedAt: null, deletionScheduledFor: date }), "deletion_scheduled");
});

test("les tâches de fond ne retiennent que les espaces ouverts", () => {
  assert.deepEqual(OPEN_ORGANIZATION_WHERE, { suspendedAt: null, deletionScheduledFor: null });
});

test("le message de connexion ne dit pas pourquoi, et donne le contact s'il est configuré", () => {
  assert.equal(suspendedAccountMessage("support@1002pattes.fr"), "Ce compte est suspendu. Contactez support@1002pattes.fr.");
  assert.equal(suspendedAccountMessage(undefined), "Ce compte est suspendu. Contactez le support de 1002 Pattes.");
  assert.equal(suspendedAccountMessage("  "), "Ce compte est suspendu. Contactez le support de 1002 Pattes.");
});
