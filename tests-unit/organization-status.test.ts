import { test } from "node:test";
import assert from "node:assert/strict";
import { OPEN_ORGANIZATION_WHERE, organizationBlockOf, publicPageClosed, suspendedAccountMessage, verificationGateOf } from "../src/lib/organization-status";

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
  // Ni fermés, ni en attente de vérification du numéro RNA.
  assert.deepEqual(OPEN_ORGANIZATION_WHERE, { suspendedAt: null, deletionScheduledFor: null, verificationStatus: { notIn: ["PENDING", "REJECTED"] } });
});

test("numéro RNA en attente ou refusé : membres vers la vérification, page publique fermée", () => {
  assert.equal(verificationGateOf({ verificationStatus: "PENDING" }), "verification_pending");
  assert.equal(verificationGateOf({ verificationStatus: "REJECTED" }), "verification_rejected");
  assert.equal(verificationGateOf({ verificationStatus: "VERIFIED" }), null);
  assert.equal(verificationGateOf({ verificationStatus: "NOT_REQUIRED" }), null);

  const open = { onboardedAt: new Date(), suspendedAt: null, deletionScheduledFor: null, verificationStatus: "VERIFIED" as const };
  assert.equal(publicPageClosed(open), false);
  assert.equal(publicPageClosed({ ...open, verificationStatus: "NOT_REQUIRED" }), false);
  assert.equal(publicPageClosed({ ...open, verificationStatus: "PENDING" }), true);
  assert.equal(publicPageClosed({ ...open, verificationStatus: "REJECTED" }), true);
  assert.equal(publicPageClosed({ ...open, onboardedAt: null }), true, "configuration pas finie");
  assert.equal(publicPageClosed({ ...open, suspendedAt: new Date() }), true, "suspendu");
  assert.equal(publicPageClosed(null), true);
});

test("le message de connexion ne dit pas pourquoi, et donne le contact s'il est configuré", () => {
  assert.equal(suspendedAccountMessage("support@1002pattes.fr"), "Ce compte est suspendu. Contactez support@1002pattes.fr.");
  assert.equal(suspendedAccountMessage(undefined), "Ce compte est suspendu. Contactez le support de 1002 Pattes.");
  assert.equal(suspendedAccountMessage("  "), "Ce compte est suspendu. Contactez le support de 1002 Pattes.");
});
