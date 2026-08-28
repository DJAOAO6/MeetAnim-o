import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addMonths,
  computeConsultationPrice,
  computeTotalPrice,
  computeTravelFee,
  findMatchingZone,
  findServiceById,
  fitsWithinOpenHours,
  generateCandidateStarts,
  getMonthGridDays,
  groupSlotsByPeriod,
  intervalsOverlap,
  isBookingDateAcceptable,
  isModeAvailableForService,
  minutesToTime,
  parseDateIdToLocalNoon,
  passesMinimumFillTime,
  publicBookingCoreSchema,
  timeToMinutes,
  toLocalDateId,
  todayIdInTimeZone,
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

test("timeToMinutes converts HH:MM to minutes since midnight", () => {
  assert.equal(timeToMinutes("00:00"), 0);
  assert.equal(timeToMinutes("09:30"), 570);
  assert.equal(timeToMinutes("23:59"), 1439);
});

test("minutesToTime is the inverse of timeToMinutes", () => {
  assert.equal(minutesToTime(0), "00:00");
  assert.equal(minutesToTime(570), "09:30");
  assert.equal(minutesToTime(1439), "23:59");
});

test("intervalsOverlap detects a partial overlap regardless of which interval starts first", () => {
  // 09:00-10:00 (60 min) vs 09:30-10:30 (60 min) : se chevauchent
  assert.equal(intervalsOverlap(540, 60, 570, 60), true);
  assert.equal(intervalsOverlap(570, 60, 540, 60), true);
});

test("intervalsOverlap treats back-to-back intervals as non-overlapping", () => {
  // 09:00-10:00 (60 min) puis 10:00-11:00 (60 min) : bord à bord, pas de chevauchement
  assert.equal(intervalsOverlap(540, 60, 600, 60), false);
});

test("intervalsOverlap detects one interval fully containing another", () => {
  // 09:00-11:00 (120 min) contient entièrement 09:30-10:00 (30 min)
  assert.equal(intervalsOverlap(540, 120, 570, 30), true);
});

test("intervalsOverlap is false for clearly separate intervals", () => {
  assert.equal(intervalsOverlap(540, 30, 900, 30), false);
});

test("intervalsOverlap reproduces the exact scenario from the audit (60 min at 09:00 blocks 09:30)", () => {
  // Un soin de 60 min à 09:00 doit rendre 09:30 indisponible pour un
  // deuxième soin, même de durée différente.
  assert.equal(intervalsOverlap(timeToMinutes("09:00"), 60, timeToMinutes("09:30"), 45), true);
  // Mais 10:00 doit rester libre.
  assert.equal(intervalsOverlap(timeToMinutes("09:00"), 60, timeToMinutes("10:00"), 45), false);
});

test("todayIdInTimeZone resolves the correct calendar day per time zone, independent of server runtime", () => {
  // 22:30 UTC un 28 août correspond à 00:30 le 29 août à Paris (UTC+2 en été).
  const now = new Date("2026-08-28T22:30:00.000Z");
  assert.equal(todayIdInTimeZone("UTC", now), "2026-08-28");
  assert.equal(todayIdInTimeZone("Europe/Paris", now), "2026-08-29");
});

test("toLocalDateId and parseDateIdToLocalNoon round-trip correctly", () => {
  const dateId = "2026-09-15";
  assert.equal(toLocalDateId(parseDateIdToLocalNoon(dateId)), dateId);
});

test("fitsWithinOpenHours accepts a slot fully within a single open hour", () => {
  const hourly = { 9: { cabinet: true, home: false } };
  assert.equal(fitsWithinOpenHours(hourly, "cabinet", timeToMinutes("09:00"), 30), true);
});

test("fitsWithinOpenHours checks every hour a longer appointment touches, not just the start", () => {
  // 09:30 pendant 60 min touche l'heure 9 (09:30-10:00) ET l'heure 10 (10:00-10:30).
  const bothOpen = { 9: { cabinet: true, home: true }, 10: { cabinet: true, home: true } };
  assert.equal(fitsWithinOpenHours(bothOpen, "cabinet", timeToMinutes("09:30"), 60), true);

  const secondHourClosed = { 9: { cabinet: true, home: true }, 10: { cabinet: false, home: false } };
  assert.equal(fitsWithinOpenHours(secondHourClosed, "cabinet", timeToMinutes("09:30"), 60), false);
});

test("fitsWithinOpenHours respects the mode (cabinet vs home can differ on the same hour)", () => {
  const hourly = { 9: { cabinet: true, home: false } };
  assert.equal(fitsWithinOpenHours(hourly, "cabinet", timeToMinutes("09:00"), 30), true);
  assert.equal(fitsWithinOpenHours(hourly, "home", timeToMinutes("09:00"), 30), false);
});

test("fitsWithinOpenHours rejects a slot that would run past midnight", () => {
  const hourly = { 23: { cabinet: true, home: true } };
  assert.equal(fitsWithinOpenHours(hourly, "cabinet", timeToMinutes("23:30"), 60), false);
});

test("fitsWithinOpenHours is always false for a closed day (hourly null)", () => {
  assert.equal(fitsWithinOpenHours(null, "cabinet", timeToMinutes("09:00"), 30), false);
});

test("generateCandidateStarts returns only starts whose full duration fits within open hours", () => {
  // Une seule heure ouverte (9h-10h) : avec un pas de 30 min, seuls 09:00 et
  // 09:30 permettent de caser une prestation de 30 min sans déborder.
  const hourly = { 9: { cabinet: true, home: true } };
  const starts = generateCandidateStarts(hourly, "cabinet", 30);
  assert.deepEqual(starts, ["09:00", "09:30"]);
});

test("generateCandidateStarts returns an empty list when nothing fits", () => {
  assert.deepEqual(generateCandidateStarts(null, "cabinet", 30), []);
});

test("groupSlotsByPeriod splits morning/afternoon at 12:00, no separate evening group", () => {
  const result = groupSlotsByPeriod(["09:00", "11:30", "12:00", "17:30", "18:00", "19:30"]);
  assert.deepEqual(result, {
    morning: ["09:00", "11:30"],
    afternoon: ["12:00", "17:30", "18:00", "19:30"],
  });
});

test("groupSlotsByPeriod returns empty arrays for empty groups rather than omitting keys", () => {
  assert.deepEqual(groupSlotsByPeriod(["09:00"]), { morning: ["09:00"], afternoon: [] });
});

test("addMonths advances within a year", () => {
  assert.equal(addMonths("2026-08", 1), "2026-09");
});

test("addMonths rolls over to the next year", () => {
  assert.equal(addMonths("2026-11", 2), "2027-01");
});

test("addMonths rolls back over the previous year with a negative delta", () => {
  assert.equal(addMonths("2026-01", -1), "2025-12");
});

test("getMonthGridDays lists every day of the month with the correct Monday-first leading offset", () => {
  // Août 2026 commence un samedi -> 5 cellules vides (lun-ven) avant le 1er.
  const result = getMonthGridDays("2026-08");
  assert.equal(result.leadingBlanks, 5);
  assert.equal(result.dateIds.length, 31);
  assert.equal(result.dateIds[0], "2026-08-01");
  assert.equal(result.dateIds[30], "2026-08-31");
});

test("getMonthGridDays has zero leading blanks when the month starts on a Monday", () => {
  // Juin 2026 commence un lundi.
  const result = getMonthGridDays("2026-06");
  assert.equal(result.leadingBlanks, 0);
  assert.equal(result.dateIds.length, 30);
});
