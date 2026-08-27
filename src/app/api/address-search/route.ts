import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { geocodedAddressSchema, type GeocodedAddress } from "@/data/geocoding";

// Service de géocodage de la Géoplateforme IGN (successeur de l'ancienne
// api-adresse.data.gouv.fr, dépréciée). Pas de clé nécessaire, limité à
// 50 req/s par IP — largement suffisant pour une autocomplétion débitée
// côté client. Le mode autocomplete=1 renvoie directement les coordonnées
// géocodées avec chaque suggestion, ce qui évite un second appel.
const IGN_SEARCH_URL = "https://data.geopf.fr/geocodage/search";
const UPSTREAM_TIMEOUT_MS = 4000;
const MIN_QUERY_LENGTH = 3;
const MAX_RESULTS = 5;

const querySchema = z.string().trim().min(MIN_QUERY_LENGTH).max(200);

const rawFeatureSchema = z.object({
  properties: z.object({
    id: z.string(),
    label: z.string(),
    housenumber: z.string().optional(),
    street: z.string().optional(),
    postcode: z.string(),
    city: z.string(),
    citycode: z.string().optional(),
  }),
  geometry: z.object({
    coordinates: z.tuple([z.number(), z.number()]),
  }),
});

const rawResponseSchema = z.object({
  features: z.array(z.unknown()),
});

/**
 * Convertit et valide chaque feature brute renvoyée par l'IGN — ce sont des
 * données externes, on ne fait jamais confiance à leur forme sans passer par
 * le schéma Zod normalisé (`geocodedAddressSchema`) avant de les relayer au
 * client.
 */
function normalizeFeatures(rawFeatures: unknown[]): GeocodedAddress[] {
  const results: GeocodedAddress[] = [];

  for (const rawFeature of rawFeatures) {
    const parsedFeature = rawFeatureSchema.safeParse(rawFeature);
    if (!parsedFeature.success) continue;

    const candidate = {
      id: parsedFeature.data.properties.id,
      label: parsedFeature.data.properties.label,
      houseNumber: parsedFeature.data.properties.housenumber,
      street: parsedFeature.data.properties.street,
      postcode: parsedFeature.data.properties.postcode,
      city: parsedFeature.data.properties.city,
      citycode: parsedFeature.data.properties.citycode,
      longitude: parsedFeature.data.geometry.coordinates[0],
      latitude: parsedFeature.data.geometry.coordinates[1],
    };

    const parsedResult = geocodedAddressSchema.safeParse(candidate);
    if (parsedResult.success) results.push(parsedResult.data);
  }

  return results;
}

export async function GET(request: NextRequest) {
  const parsedQuery = querySchema.safeParse(request.nextUrl.searchParams.get("q"));
  if (!parsedQuery.success) {
    return NextResponse.json({ results: [] });
  }

  const upstreamUrl = new URL(IGN_SEARCH_URL);
  upstreamUrl.searchParams.set("q", parsedQuery.data);
  upstreamUrl.searchParams.set("index", "address");
  upstreamUrl.searchParams.set("autocomplete", "1");
  upstreamUrl.searchParams.set("limit", String(MAX_RESULTS));

  try {
    const upstreamResponse = await fetch(upstreamUrl, { signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
    if (!upstreamResponse.ok) {
      return NextResponse.json({ results: [], error: "upstream" });
    }

    const rawBody: unknown = await upstreamResponse.json();
    const parsedBody = rawResponseSchema.safeParse(rawBody);
    if (!parsedBody.success) {
      return NextResponse.json({ results: [], error: "upstream" });
    }

    return NextResponse.json({ results: normalizeFeatures(parsedBody.data.features) });
  } catch {
    // Le service IGN peut être temporairement indisponible : on dégrade
    // proprement plutôt que de bloquer le formulaire de réservation.
    return NextResponse.json({ results: [], error: "network" });
  }
}
