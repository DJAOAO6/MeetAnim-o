/**
 * Mesure grossière de la carte clients à 100, 1 000 et 5 000 clients
 * (phase 8.10) — sur la base de TEST uniquement (.env.test.local), jamais
 * sur la base de développement.
 *
 *   npx tsx scripts/bench-map.ts
 *
 * Crée des clients fictifs (préfixe « bench- »), mesure la requête de la
 * carte, la taille des données envoyées au navigateur, le regroupement en
 * pastilles (supercluster) et un filtre, puis supprime tout ce qu'il a créé.
 */
import { config } from "dotenv";
import Supercluster from "supercluster";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

config({ path: ".env.test.local", quiet: true });
if (!process.env.DATABASE_URL?.includes("test")) {
  console.error("Base de test introuvable (.env.test.local) : arrêt, par sécurité.");
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const SPECIES = ["Chien", "Chat", "Cheval", "NAC", "Petit ruminant"];
const ms = (start: bigint) => Number(process.hrtime.bigint() - start) / 1e6;

async function cleanup() {
  await prisma.reminder.deleteMany({ where: { id: { startsWith: "bench-" } } });
  await prisma.consultation.deleteMany({ where: { id: { startsWith: "bench-" } } });
  await prisma.animal.deleteMany({ where: { id: { startsWith: "bench-" } } });
  await prisma.client.deleteMany({ where: { id: { startsWith: "bench-" } } });
}

async function seed(count: number) {
  const clients = [];
  const animals = [];
  const consultations = [];
  const reminders = [];
  for (let index = 0; index < count; index += 1) {
    const id = `bench-c-${index}`;
    // Normandie, répartis au hasard (graine fixe pour des mesures comparables).
    const lat = 48.9 + ((index * 7919) % 1000) / 1000;
    const lng = 0.1 + ((index * 104729) % 1000) / 600;
    clients.push({ id, firstName: "Bench", lastName: `Client ${index}`, phone: "0600000000", email: `${id}@example.fr`, city: "Rouen", address: `${index} rue Test`, latitude: lat, longitude: lng, geocodePrecision: "EXACT" as const });
    for (let animal = 0; animal < 1 + (index % 3); animal += 1) {
      const animalId = `bench-a-${index}-${animal}`;
      animals.push({ id: animalId, clientId: id, name: `Animal ${animal}`, species: SPECIES[(index + animal) % SPECIES.length], breed: "", age: "", weight: "", sex: "", avatar: "", avatarBackground: "", history: "", conditions: "", treatments: "", notes: "" });
      if (index % 2 === 0) consultations.push({ id: `bench-k-${index}-${animal}`, animalId, date: new Date(Date.now() - (index % 400) * 86400000), service: "Séance", mode: "CABINET" as const, price: 50, summary: "" });
      if (index % 10 === 0) reminders.push({ id: `bench-r-${index}-${animal}`, clientId: id, animalId, lastConsultation: new Date(), delay: "SIX_MONTHS" as const, dueDate: new Date(), status: "DUE" as const });
    }
  }
  await prisma.client.createMany({ data: clients });
  await prisma.animal.createMany({ data: animals });
  await prisma.consultation.createMany({ data: consultations });
  await prisma.reminder.createMany({ data: reminders });
}

/** Même forme de requête que getMapClientSummaries (src/lib/map-clients.ts). */
async function mapQuery() {
  return prisma.client.findMany({
    where: { id: { startsWith: "bench-" } },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: {
      id: true, firstName: true, lastName: true, city: true, postalCode: true, phone: true, latitude: true, longitude: true, geocodePrecision: true,
      animals: {
        orderBy: { name: "asc" },
        select: {
          id: true, name: true, species: true, breed: true, avatar: true, reminderDate: true,
          consultations: { orderBy: { date: "desc" }, take: 1, select: { date: true } },
          reminders: { where: { status: "DUE" }, select: { id: true } },
        },
      },
      appointments: { where: { mode: "DOMICILE", latitude: { not: null }, longitude: { not: null } }, orderBy: { date: "desc" }, take: 1, select: { latitude: true, longitude: true } },
    },
  });
}

async function main() {
  await cleanup();
  const rows: string[] = ["| Clients | Requête | Données envoyées | Pastilles (chargement) | Pastilles (vue région / ville) | Filtre + tri |", "|---|---|---|---|---|---|"];
  for (const count of [100, 1000, 5000]) {
    await seed(count);
    let start = process.hrtime.bigint();
    const result = await mapQuery();
    const queryMs = ms(start);
    // Données comparables à ce que reçoit le navigateur (un résumé par client).
    const summaries = result.map((client) => ({
      id: client.id, ownerName: `${client.firstName} ${client.lastName}`, city: client.city, postalCode: client.postalCode ?? "", phone: client.phone,
      animals: client.animals.map((animal) => ({ id: animal.id, name: animal.name, species: animal.species, breed: animal.breed, avatar: animal.avatar, dueForReminder: animal.reminders.length > 0 })),
      lastConsultation: "12 janvier 2026", lastConsultationAt: client.animals[0]?.consultations[0]?.date.toISOString().slice(0, 10) ?? null, nextAppointment: null, nextReminder: "-",
      dueForReminder: client.animals.some((animal) => animal.reminders.length > 0), dueReminderIds: client.animals.flatMap((animal) => animal.reminders.map((reminder) => reminder.id)),
      coordinates: client.latitude != null && client.longitude != null ? { lat: client.latitude, lng: client.longitude } : null, positionSource: "address", precision: client.geocodePrecision,
    }));
    const payloadKb = Buffer.byteLength(JSON.stringify(summaries)) / 1024;

    start = process.hrtime.bigint();
    const index = new Supercluster({ radius: 48, maxZoom: 18 });
    index.load(summaries.filter((summary) => summary.coordinates).map((summary) => ({ type: "Feature" as const, properties: { id: summary.id }, geometry: { type: "Point" as const, coordinates: [summary.coordinates!.lng, summary.coordinates!.lat] } })));
    const clusterLoadMs = ms(start);
    start = process.hrtime.bigint();
    const regional = index.getClusters([-0.5, 48.5, 2, 50], 8).length;
    const city = index.getClusters([0.9, 49.3, 1.3, 49.6], 12).length;
    const clusterQueryMs = ms(start);

    start = process.hrtime.bigint();
    const collator = new Intl.Collator("fr-FR", { sensitivity: "base" });
    summaries.filter((summary) => summary.animals.some((animal) => animal.species === "Cheval")).sort((a, b) => collator.compare(a.ownerName, b.ownerName));
    const filterMs = ms(start);

    rows.push(`| ${count} | ${queryMs.toFixed(0)} ms | ${payloadKb.toFixed(0)} Ko | ${clusterLoadMs.toFixed(1)} ms | ${clusterQueryMs.toFixed(1)} ms (${regional} / ${city} pastilles) | ${filterMs.toFixed(1)} ms |`);
    await cleanup();
  }
  console.log(rows.join("\n"));
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await cleanup().catch(() => {});
  await prisma.$disconnect();
  process.exit(1);
});
