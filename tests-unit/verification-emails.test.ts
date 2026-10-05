import { test } from "node:test";
import assert from "node:assert/strict";
import { verificationApprovedTemplate, verificationRejectedTemplate, verificationRequestedTemplate } from "../src/lib/email/templates";

test("validation : la page de rendez-vous et le tableau de bord", () => {
  const email = verificationApprovedTemplate({ organizationName: "Cabinet Élodie", slug: "elodie" });
  assert.match(email.subject, /vérifié/);
  assert.match(email.text, /\/reserver\/elodie/);
  assert.match(email.text, /\/dashboard/);
});

test("refus : le motif, échappé, et le lien pour corriger le numéro", () => {
  const email = verificationRejectedTemplate({ organizationName: "Cabinet <b>", reason: "Numéro <introuvable>" });
  assert.match(email.text, /Motif : Numéro <introuvable>/);
  assert.match(email.text, /\/dashboard\/verification/);
  assert.ok(!email.html.includes("<introuvable>"), "le motif est échappé dans le HTML");
  assert.ok(email.html.includes("Numéro &lt;introuvable&gt;"));
  assert.ok(!email.html.includes("Cabinet <b>"));
});

test("demande : de quoi contrôler le numéro sur la plateforme", () => {
  const email = verificationRequestedTemplate({ organizationName: "Cabinet Élodie", profession: "Ostéopathe animalier", registrationNumber: "OA1951" });
  assert.match(email.subject, /Cabinet Élodie/);
  assert.match(email.text, /OA1951/);
  assert.match(email.text, /\/plateforme/);
});
