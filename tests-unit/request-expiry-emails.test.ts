import { test } from "node:test";
import assert from "node:assert/strict";
import { requestExpiredClientTemplate, requestExpiredProfessionalTemplate } from "../src/lib/email/templates";

test("expiration, au client : rien n'a pu être confirmé, et le lien pour refaire une demande", () => {
  const email = requestExpiredClientTemplate({ clientFirstName: "Odile", animalName: "Tirelire <3", professionalFirstName: "Pauline", professionalCompany: "PF Ostéo", professionalPhone: "06 00 00 00 00", bookingUrl: "https://exemple.fr/reserver/pauline" });
  assert.match(email.subject, /a expiré/);
  assert.match(email.text, /Aucun des horaires proposés pour Tirelire <3 n'a pu être confirmé à temps/);
  assert.match(email.text, /Vous pouvez faire une nouvelle demande : https:\/\/exemple\.fr\/reserver\/pauline/);
  assert.ok(email.html.includes("https://exemple.fr/reserver/pauline"));
  assert.ok(!email.html.includes("Tirelire <3"), "le nom de l'animal est échappé dans le HTML");
});

test("expiration, au professionnel : la demande et les horaires de nouveau libres", () => {
  const email = requestExpiredProfessionalTemplate({ professionalFirstName: "Pauline", clientName: "Odile <Options>", animalName: "Tirelire", slotLabels: ["lundi 2 novembre à 10:00", "mardi 3 novembre à 14:30"] });
  assert.match(email.subject, /Demande expirée — Odile <Options> \(Tirelire\)/);
  assert.match(email.text, /proposait 2 horaires/);
  assert.match(email.text, /- lundi 2 novembre à 10:00\n- mardi 3 novembre à 14:30/);
  assert.match(email.text, /\/dashboard\/agenda/);
  assert.ok(!email.html.includes("Odile <Options>"), "le nom du client est échappé dans le HTML");
  assert.ok(email.html.includes("1er choix") && email.html.includes("2e choix"));
});
