import { strict as assert } from "node:assert";
import { test } from "node:test";
import { appointmentReminderClientTemplate, assistanceStartedTemplate, reminderEmailTemplate } from "../src/lib/email/templates";

const appointment = {
  clientFirstName: "Hélène", animalName: "Pistache", serviceName: "Ostéopathie", dateLabel: "Lundi 3 novembre", time: "10:00",
  modeLabel: "Au cabinet", locationLabel: "", professionalFirstName: "Camille", professionalCompany: "Cabinet Test", professionalPhone: "", bookingUrl: "https://exemple.fr",
};

test("rappels et relances disent comment ne plus en recevoir (RGPD-17)", () => {
  for (const message of [appointmentReminderClientTemplate(appointment), reminderEmailTemplate({ professionalCompany: "Cabinet Test", message: "Bonjour" })]) {
    assert.match(message.text, /ne souhaitez plus recevoir ces messages/);
    assert.match(message.html, /ne souhaitez plus recevoir ces messages/);
  }
});

test("l'e-mail d'assistance nomme l'espace et le motif, échappés (RGPD-11)", () => {
  const message = assistanceStartedTemplate({ organizationName: "Cabinet <b>Test</b>", assistedName: "Camille", reason: "Import <script>", untilLabel: "15:30" });
  assert.match(message.text, /Motif indiqué : Import <script>/);
  assert.ok(!message.html.includes("<script>"), "le motif est échappé dans le HTML");
  assert.ok(message.html.includes("Cabinet &lt;b&gt;Test&lt;/b&gt;"));
});
