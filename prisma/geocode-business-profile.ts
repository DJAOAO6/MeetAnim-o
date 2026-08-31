import { config } from "dotenv";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "../src/generated/prisma/client";

config({ path: ".env.local" });

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const IGN_SEARCH_URL = "https://data.geopf.fr/geocodage/search";

/**
 * Rattrapage en ligne de commande : géocode l'adresse du cabinet déjà
 * enregistrée en base, pour un profil créé avant l'ajout de latitude/
 * longitude (Phase 0 — refonte tournées). `npm run geocode:profile`.
 *
 * Script autonome (comme seed.ts) : n'importe pas src/lib/geocoding.ts, qui
 * dépend de "server-only" — résolu uniquement par le bundler Next.js, pas
 * par tsx en exécution directe.
 */
async function main() {
  const profile = await prisma.businessProfile.findFirst();
  if (!profile) {
    console.log("Aucun profil en base — rien à géocoder.");
    return;
  }

  const query = `${profile.address} ${profile.postalCode} ${profile.city}`;
  const upstreamUrl = new URL(IGN_SEARCH_URL);
  upstreamUrl.searchParams.set("q", query);
  upstreamUrl.searchParams.set("index", "address");
  upstreamUrl.searchParams.set("limit", "1");

  const response = await fetch(upstreamUrl);
  const body = (await response.json()) as { features?: Array<{ geometry?: { coordinates?: [number, number] } }> };
  const coordinates = body.features?.[0]?.geometry?.coordinates;

  if (!response.ok || !coordinates) {
    console.error(`Échec du géocodage pour « ${query} ». Coordonnées inchangées.`);
    process.exitCode = 1;
    return;
  }

  const [longitude, latitude] = coordinates;
  await prisma.businessProfile.update({ where: { id: profile.id }, data: { latitude, longitude } });
  console.log(`Profil géocodé : ${latitude}, ${longitude}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
