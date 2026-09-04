import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

config({ path: ".env.local" });

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const IGN_SEARCH_URL = "https://data.geopf.fr/geocodage/search";
const DELAY_BETWEEN_CALLS_MS = 300;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Rattrapage en ligne de commande : géocode les fiches clients créées avant
 * le géocodage automatique à l'écriture, ou dont la dernière tentative a
 * échoué depuis (adresse corrigée entre-temps, ex.). `npm run geocode:clients`.
 *
 * Ré-exécutable sans effet de bord : ne traite que `geocodedAt IS NULL`
 * (jamais tenté) — un client déjà tenté, même en échec, porte `geocodedAt`
 * et n'est pas retraité ici (rattrapage individuel : bouton "localiser").
 *
 * Script autonome (comme seed.ts / geocode-business-profile.ts) : n'importe
 * pas src/lib/geocoding.ts, qui dépend de "server-only" — résolu uniquement
 * par le bundler Next.js, pas par tsx en exécution directe.
 */
async function geocodeOne(address: string, city: string): Promise<{ latitude: number; longitude: number } | null> {
  const query = `${address}, ${city}`;
  const upstreamUrl = new URL(IGN_SEARCH_URL);
  upstreamUrl.searchParams.set("q", query);
  upstreamUrl.searchParams.set("index", "address");
  upstreamUrl.searchParams.set("limit", "1");

  try {
    const response = await fetch(upstreamUrl);
    if (!response.ok) return null;
    const body = (await response.json()) as { features?: Array<{ geometry?: { coordinates?: [number, number] } }> };
    const coordinates = body.features?.[0]?.geometry?.coordinates;
    if (!coordinates) return null;
    const [longitude, latitude] = coordinates;
    return { latitude, longitude };
  } catch {
    return null;
  }
}

async function main() {
  const clients = await prisma.client.findMany({
    where: { geocodedAt: null },
    select: { id: true, address: true, city: true },
  });

  if (clients.length === 0) {
    console.log("Aucun client à géocoder — tous ont déjà une tentative enregistrée.");
    return;
  }

  console.log(`${clients.length} client(s) à géocoder…`);
  let succeeded = 0;
  let failed = 0;

  for (const [index, client] of clients.entries()) {
    if (!client.address || !client.city) {
      // Fiche sans adresse exploitable : on marque quand même geocodedAt
      // pour ne pas la retraiter à chaque exécution, sans appeler l'API.
      await prisma.client.update({ where: { id: client.id }, data: { geocodedAt: new Date() } });
      failed += 1;
      console.log(`[${index + 1}/${clients.length}] ${client.id} — adresse incomplète, ignoré.`);
      continue;
    }

    const coordinates = await geocodeOne(client.address, client.city);
    await prisma.client.update({
      where: { id: client.id },
      data: { latitude: coordinates?.latitude ?? null, longitude: coordinates?.longitude ?? null, geocodedAt: new Date() },
    });

    if (coordinates) {
      succeeded += 1;
      console.log(`[${index + 1}/${clients.length}] ${client.id} — géocodé (${coordinates.latitude}, ${coordinates.longitude}).`);
    } else {
      failed += 1;
      console.log(`[${index + 1}/${clients.length}] ${client.id} — échec (adresse introuvable ou API indisponible).`);
    }

    if (index < clients.length - 1) await sleep(DELAY_BETWEEN_CALLS_MS);
  }

  console.log(`Terminé : ${succeeded} géocodé(s), ${failed} en échec (adresse à vérifier, ou via le bouton "localiser").`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
