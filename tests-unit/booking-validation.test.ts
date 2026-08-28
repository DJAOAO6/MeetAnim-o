import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeConsultationPrice,
  computeTotalPrice,
  computeTravelFee,
  findMatchingZone,
  findServiceById,
  isBookingDateAcceptable,
  isModeAvailableForService,
  passesMinimumFillTime,
  publicBookingCoreSchema,
  MIN_FORM_FILL_MS,
} from "../src/lib/booking-validation";
import type { PublicService, PublicZone } from "../src/data/public-booking";

const service: PublicService = {
  id: "svc-1",
  name: "Ostéopathie canine",
  description: "Bilan et manipulations.",
  duration: 60,
  animalTypes: ["Chien"],
  cabinetEnabled: true,
  cabinetPrice: 60,
  homeEnabled: true,
  homePrice: 70,
  travelFeeMode: "zone",
  fixedTravelFee: 0,
};

const cabinetOnlyService: PublicService = { ...service, id: "svc-2", homeEnabled: false, homePrice: 0 };
const fixedFeeService: PublicService = { ...service, id: "svc-3", travelFeeMode: "fixed", fixedTravelFee: 12 };
const noFeeService: PublicService = { ...service, id: "svc-4", travelFeeMode: "none" };

const zones: PublicZone[] = [
  { id: "zone-rouen", name: "Zone Rouen", cities: ["Rouen", "Bois-Guillaume"], postalCodes: ["76000", "76130"], travelFee: 0, tourDays: ["Mardi"] },
  { id: "zone-le-havre", name: "Zone Le Havre", cities: ["Le Havre"], postalCodes: ["76600"], travelFee: 10, tourDays: ["Lundi"] },
];

test("isBookingDateAcceptable rejects past dates", () => {
  assert.equal(isBookingDateAcceptable("2026-08-27", "2026-08-28", "2026-11-24"), false);
});

test("isBookingDateAcceptable accepts today", () => {
  assert.equal(isBookingDateAcceptable("2026-08-28", "2026-08-28", "2026-11-24"), true);
});

test("isBookingDateAcceptable accepts a future date within the window", () => {
  assert.equal(isBookingDateAcceptable("2026-09-15", "2026-08-28", "2026-11-24"), true);
});

test("isBookingDateAcceptable rejects a date beyond the booking window", () => {
  assert.equal(isBookingDateAcceptable("2026-12-01", "2026-08-28", "2026-11-24"), false);
});

test("findServiceById finds an existing service and returns undefined otherwise", () => {
  assert.equal(findServiceById([service, cabinetOnlyService], "svc-2"), cabinetOnlyService);
  assert.equal(findServiceById([service], "unknown"), undefined);
});

test("isModeAvailableForService reflects cabinetEnabled/homeEnabled", () => {
  assert.equal(isModeAvailableForService(service, "cabinet"), true);
  assert.equal(isModeAvailableForService(service, "home"), true);
  assert.equal(isModeAvailableForService(cabinetOnlyService, "home"), false);
});

test("computeConsultationPrice picks the price for the given mode", () => {
  assert.equal(computeConsultationPrice(service, "cabinet"), 60);
  assert.equal(computeConsultationPrice(service, "home"), 70);
});

test("findMatchingZone matches by city, case/accent-insensitive", () => {
  const match = findMatchingZone(zones, undefined, "rouen");
  assert.equal(match?.id, "zone-rouen");
});

test("findMatchingZone matches by postal code", () => {
  const match = findMatchingZone(zones, "76600", "Une Ville Inconnue");
  assert.equal(match?.id, "zone-le-havre");
});

test("findMatchingZone returns undefined when nothing matches", () => {
  assert.equal(findMatchingZone(zones, "75000", "Paris"), undefined);
});

test("computeTravelFee is always 0 for cabinet mode, regardless of service config", () => {
  assert.equal(computeTravelFee(fixedFeeService, "cabinet", zones, "76000", "Rouen"), 0);
});

test("computeTravelFee uses fixedTravelFee for fixed mode", () => {
  assert.equal(computeTravelFee(fixedFeeService, "home", zones, undefined, undefined), 12);
});

test("computeTravelFee resolves the matching zone's fee for zone mode", () => {
  assert.equal(computeTravelFee(service, "home", zones, "76600", undefined), 10);
});

test("computeTravelFee falls back to 0 when zone mode has no matching zone (never trusts a client-supplied zone)", () => {
  assert.equal(computeTravelFee(service, "home", zones, "00000", "Nulle Part"), 0);
});

test("computeTravelFee is 0 for travelFeeMode 'none'", () => {
  assert.equal(computeTravelFee(noFeeService, "home", zones, "76600", undefined), 0);
});

test("computeTotalPrice sums consultation price and travel fee", () => {
  assert.equal(computeTotalPrice(fixedFeeService, "home", zones, undefined, undefined), 70 + 12);
  assert.equal(computeTotalPrice(fixedFeeService, "cabinet", zones, undefined, undefined), 60);
});

test("passesMinimumFillTime rejects submissions faster than the threshold", () => {
  const startedAt = 1_000_000;
  assert.equal(passesMinimumFillTime(startedAt, startedAt + MIN_FORM_FILL_MS - 1), false);
});

test("passesMinimumFillTime accepts submissions at or after the threshold", () => {
  const startedAt = 1_000_000;
  assert.equal(passesMinimumFillTime(startedAt, startedAt + MIN_FORM_FILL_MS), true);
});

test("passesMinimumFillTime rejects a missing or non-finite startedAt", () => {
  assert.equal(passesMinimumFillTime(undefined, Date.now()), false);
  assert.equal(passesMinimumFillTime(Number.NaN, Date.now()), false);
});

test("publicBookingCoreSchema accepts a well-formed payload", () => {
  const result = publicBookingCoreSchema.safeParse({
    serviceId: "svc-1",
    date: "2026-09-15",
    start: "09:00",
    mode: "cabinet",
    clientName: "Marie Dupont",
    animalName: "Luna",
  });
  assert.equal(result.success, true);
});

test("publicBookingCoreSchema rejects a malformed date", () => {
  const result = publicBookingCoreSchema.safeParse({
    serviceId: "svc-1",
    date: "15/09/2026",
    start: "09:00",
    mode: "cabinet",
    clientName: "Marie Dupont",
    animalName: "Luna",
  });
  assert.equal(result.success, false);
});

test("publicBookingCoreSchema rejects a mode outside the enum (blocks the previous unhandled-crash path)", () => {
  const result = publicBookingCoreSchema.safeParse({
    serviceId: "svc-1",
    date: "2026-09-15",
    start: "09:00",
    mode: "hack",
    clientName: "Marie Dupont",
    animalName: "Luna",
  });
  assert.equal(result.success, false);
});

test("publicBookingCoreSchema rejects a malformed time", () => {
  const result = publicBookingCoreSchema.safeParse({
    serviceId: "svc-1",
    date: "2026-09-15",
    start: "25:99",
    mode: "cabinet",
    clientName: "Marie Dupont",
    animalName: "Luna",
  });
  assert.equal(result.success, false);
});
