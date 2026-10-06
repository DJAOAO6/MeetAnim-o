import { test } from "node:test";
import assert from "node:assert/strict";
import { frenchList, groupByVisit, visitSummary } from "../src/lib/visit-group";
import { appointmentReminderClientTemplate } from "../src/lib/email/templates";

test("liste à la française", () => {
  assert.equal(frenchList([]), "");
  assert.equal(frenchList(["Mirsa"]), "Mirsa");
  assert.equal(frenchList(["Mirsa", "Pacha"]), "Mirsa et Pacha");
  assert.equal(frenchList(["Mirsa", "Pacha", "Luna"]), "Mirsa, Pacha et Luna");
});

test("regroupement par visite, dans l'ordre des heures", () => {
  const groups = groupByVisit([
    { id: "b", start: "10:50", visitGroupId: "v1" },
    { id: "s", start: "09:00", visitGroupId: null },
    { id: "a", start: "10:00", visitGroupId: "v1" },
  ]);
  assert.deepEqual(groups.map((group) => group.map((item) => item.id)), [["s"], ["a", "b"]]);
});

test("une visite résumée en un seul rendez-vous pour l'e-mail", () => {
  const summary = visitSummary([
    { id: "b", start: "10:50", duration: 45, animalName: "Pacha", serviceName: "Séance", visitGroupId: "v1" },
    { id: "a", start: "10:00", duration: 50, animalName: "Mirsa", serviceName: "Bilan", visitGroupId: "v1" },
  ]);
  assert.deepEqual(summary, { id: "v1", start: "10:00", duration: 95, animalName: "Mirsa et Pacha", serviceName: "Bilan pour Mirsa à 10:00, Séance pour Pacha à 10:50", animalCount: 2 });
  assert.equal(visitSummary([{ id: "a", start: "10:00", duration: 50, animalName: "Mirsa", serviceName: "Bilan" }]).animalName, "Mirsa");
});

test("le rappel d'une visite s'accorde au pluriel", () => {
  const base = { clientFirstName: "Hélène", serviceName: "Bilan pour Mirsa à 10:00, Séance pour Pacha à 10:50", dateLabel: "Mardi 7 octobre", time: "10:00", modeLabel: "À domicile", locationLabel: "1 rue X", professionalFirstName: "Pauline", professionalCompany: "PF", professionalPhone: "", bookingUrl: "" };
  const visit = appointmentReminderClientTemplate({ ...base, animalName: "Mirsa et Pacha", animalCount: 2 });
  assert.match(visit.text, /Mirsa et Pacha ont rendez-vous/);
  assert.match(visit.text, /Prestations : Bilan pour Mirsa/);
  const single = appointmentReminderClientTemplate({ ...base, animalName: "Mirsa", serviceName: "Bilan" });
  assert.match(single.text, /Mirsa a rendez-vous/);
  assert.match(single.text, /Prestation : Bilan/);
});
