import { test } from "node:test";
import assert from "node:assert/strict";
import { buildGoogleCalendarLink, buildOutlookCalendarLink } from "../src/lib/calendar/client-calendar-links";

const winterInput = {
  title: "Ostéopathie canine — Rex",
  description: "Rendez-vous avec Pauline Faucillon",
  location: "12 rue Exemple, 76000 Rouen",
  dateId: "2026-11-05",
  start: "14:30",
  durationMinutes: 60,
};

test("buildGoogleCalendarLink pointe vers calendar.google.com avec action=TEMPLATE", () => {
  const url = new URL(buildGoogleCalendarLink(winterInput));
  assert.equal(url.origin, "https://calendar.google.com");
  assert.equal(url.pathname, "/calendar/render");
  assert.equal(url.searchParams.get("action"), "TEMPLATE");
  assert.equal(url.searchParams.get("text"), winterInput.title);
  assert.equal(url.searchParams.get("ctz"), "Europe/Paris");
});

test("buildGoogleCalendarLink encode les dates au format compact YYYYMMDDTHHMMSS/YYYYMMDDTHHMMSS", () => {
  const url = new URL(buildGoogleCalendarLink(winterInput));
  assert.equal(url.searchParams.get("dates"), "20261105T143000/20261105T153000");
});

test("buildGoogleCalendarLink gère un rendez-vous qui franchit minuit", () => {
  const url = new URL(buildGoogleCalendarLink({ ...winterInput, start: "23:45", durationMinutes: 30 }));
  assert.equal(url.searchParams.get("dates"), "20261105T234500/20261106T001500");
});

test("buildOutlookCalendarLink pointe vers le compose Outlook avec rru=addevent", () => {
  const url = new URL(buildOutlookCalendarLink(winterInput));
  assert.equal(url.origin, "https://outlook.live.com");
  assert.equal(url.searchParams.get("rru"), "addevent");
  assert.equal(url.searchParams.get("subject"), winterInput.title);
  assert.equal(url.searchParams.get("location"), winterInput.location);
});

test("buildOutlookCalendarLink utilise le décalage +01:00 en hiver et +02:00 en été (Europe/Paris)", () => {
  const winterUrl = new URL(buildOutlookCalendarLink(winterInput));
  assert.ok(winterUrl.searchParams.get("startdt")!.endsWith("+01:00"));

  const summerUrl = new URL(buildOutlookCalendarLink({ ...winterInput, dateId: "2026-07-14" }));
  assert.ok(summerUrl.searchParams.get("startdt")!.endsWith("+02:00"));
});
