import { test } from "node:test";
import assert from "node:assert/strict";
import { archiveConfirmationMessage, archivedOnLabel } from "../src/lib/client-archive";

test("une fiche sans rendez-vous à venir", () => {
  assert.equal(
    archiveConfirmationMessage(1, "Marie Dupont", [{ name: "Marie Dupont", count: 0 }]),
    "Archiver la fiche de Marie Dupont ? Elle sortira de la liste, de la recherche et des relances, sans être supprimée.",
  );
});

test("les rendez-vous à venir sont annoncés, et conservés", () => {
  const message = archiveConfirmationMessage(1, "Marie Dupont", [{ name: "Marie Dupont", count: 2 }]);
  assert.match(message, /Marie Dupont a 2 rendez-vous à venir\.\nIls sont conservés\.$/);
  assert.match(archiveConfirmationMessage(1, "Marie Dupont", [{ name: "Marie Dupont", count: 1 }]), /Il est conservé\.$/);
});

test("plusieurs fiches : seules celles qui ont des rendez-vous sont nommées", () => {
  const message = archiveConfirmationMessage(3, null, [{ name: "A B", count: 0 }, { name: "C D", count: 1 }, { name: "E F", count: 2 }]);
  assert.match(message, /^Archiver ces 3 fiches clients \? Elles sortiront de la liste, de la recherche et des relances, sans être supprimées\./);
  assert.ok(!message.includes("A B"));
  assert.match(message, /C D a 1 rendez-vous à venir\.\nE F a 2 rendez-vous à venir\.\nIls sont conservés\./);
});

test("date d'archivage lisible, à l'heure de Paris", () => {
  assert.equal(archivedOnLabel("2026-10-05T23:30:00.000Z"), "Client archivé le 6 octobre 2026");
});
