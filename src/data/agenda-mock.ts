import { getDayAvailability } from "@/lib/availability";
import type { AvailabilitySettings } from "@/data/settings";

export type MockEventKind = "cabinet" | "domicile" | "pending" | "tournee";

export type MockDayItem = {
  id: string;
  start: string;
  kind: MockEventKind;
  title: string;
  subtitle: string;
};

export type MockDayAgenda = {
  items: MockDayItem[];
  count: number;
  isClosed: boolean;
};

const ANIMAL_NAMES = ["Luna", "Rex", "Swassane", "Janine", "Fripon", "Nala", "Milo"];
const CLIENT_NAMES = ["Marie Dupont", "Océane Roux", "Coraline Robert", "Client Volant", "Eugénie Hubert", "Gatien Pierre", "Alice Dupuis"];
const TOUR_NAMES = ["Tournée Le Havre", "Tournée Rouen", "Tournée Dieppe"];
const ZONES = ["Le Havre", "Rouen", "Dieppe", "Harfleur", "Montivilliers"];
const START_HOURS = [8, 9, 10, 11, 14, 15, 16];

function dateSeed(date: Date) {
  return date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
}

function mulberry32(seed: number) {
  let state = seed;
  return function random() {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Génère de façon déterministe un contenu fictif pour une journée (démo Mois/Année),
 * en respectant les disponibilités réelles (jours fermés = journée vide).
 */
export function getMockDayAgenda(date: Date, availability: AvailabilitySettings): MockDayAgenda {
  const { open } = getDayAvailability(date, availability);
  if (!open) return { items: [], count: 0, isClosed: true };

  const random = mulberry32(dateSeed(date));
  const isBusyMonth = date.getMonth() === 4;
  const base = random();
  const total = Math.max(0, Math.floor(base * (isBusyMonth ? 8 : 6)) - (date.getDay() === 6 ? 2 : 0));
  const hasTournee = random() < (isBusyMonth ? 0.35 : 0.22);

  const items: MockDayItem[] = [];

  if (hasTournee) {
    const tourName = TOUR_NAMES[Math.floor(random() * TOUR_NAMES.length)];
    items.push({
      id: `tournee-${dateSeed(date)}`,
      start: "13:00",
      kind: "tournee",
      title: tourName,
      subtitle: `${2 + Math.floor(random() * 4)} rendez-vous`,
    });
  }

  const appointmentCount = Math.max(0, total - (hasTournee ? 1 : 0));
  const usedAnimals = new Set<number>();
  const usedClients = new Set<number>();
  const usedSlots = new Set<string>();

  for (let index = 0; index < appointmentCount; index++) {
    let animalIndex = Math.floor(random() * ANIMAL_NAMES.length);
    if (usedAnimals.size < ANIMAL_NAMES.length) {
      while (usedAnimals.has(animalIndex)) animalIndex = (animalIndex + 1) % ANIMAL_NAMES.length;
    }
    usedAnimals.add(animalIndex);

    let clientIndex = Math.floor(random() * CLIENT_NAMES.length);
    if (usedClients.size < CLIENT_NAMES.length) {
      while (usedClients.has(clientIndex)) clientIndex = (clientIndex + 1) % CLIENT_NAMES.length;
    }
    usedClients.add(clientIndex);

    let hour = START_HOURS[Math.floor(random() * START_HOURS.length)];
    let minute = Math.floor(random() * 4) * 15;
    let slotKey = `${hour}:${minute}`;
    let guard = 0;
    while (usedSlots.has(slotKey) && guard < START_HOURS.length * 4) {
      minute = (minute + 15) % 60;
      if (minute === 0) hour = START_HOURS[(START_HOURS.indexOf(hour) + 1) % START_HOURS.length];
      slotKey = `${hour}:${minute}`;
      guard += 1;
    }
    usedSlots.add(slotKey);

    const isPending = random() < 0.08;
    const mode = random() > 0.5 ? "cabinet" : "domicile";

    items.push({
      id: `mock-${dateSeed(date)}-${index}`,
      start: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
      kind: isPending ? "pending" : mode,
      title: ANIMAL_NAMES[animalIndex],
      subtitle: mode === "cabinet" ? CLIENT_NAMES[clientIndex] : `${CLIENT_NAMES[clientIndex]} · ${ZONES[Math.floor(random() * ZONES.length)]}`,
    });
  }

  items.sort((a, b) => a.start.localeCompare(b.start));

  return { items, count: items.length, isClosed: false };
}

export const YEAR_STATS = {
  consultations: 428,
  revenueLabel: "28 420 €",
  tours: 36,
  distanceKm: 4280,
  busiestMonth: "Mai",
  avgDurationMinutes: 28,
};

export const TOP_ZONES = [
  { name: "Le Havre", count: 128 },
  { name: "Harfleur", count: 96 },
  { name: "Montivilliers", count: 78 },
  { name: "Sainte-Adresse", count: 54 },
];

export const TOP_SPECIES = [
  { name: "Chien", count: 268 },
  { name: "Chat", count: 124 },
  { name: "NAC", count: 24 },
  { name: "Autre", count: 12 },
];
