import "server-only";
import { z } from "zod";
import { geocodedAddressSchema, type GeocodedAddress } from "@/data/geocoding";

// Même service que /api/address-search (Géoplateforme IGN) — voir ce
// fichier pour le détail du choix. Extrait ici pour être réutilisé côté
// serveur par le géocodage de l'adresse du cabinet (business-profile-actions),
// qui n'a pas besoin d'autocomplétion mais d'un résultat unique pour une
// adresse déjà complète.
const IGN_SEARCH_URL = "https://data.geopf.fr/geocodage/search";
const UPSTREAM_TIMEOUT_MS = 4000;

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
 * Convertit et valide chaque feature brute renvoyée par l'IGN — données
 * externes, jamais relayées sans passer par geocodedAddressSchema.
 */
export function normalizeGeocodedFeatures(rawFeatures: unknown[]): GeocodedAddress[] {
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

/**
 * Géocode une adresse déjà complète (un seul résultat attendu), pour le
 * cabinet de la praticienne — jamais bloquant : renvoie null sur toute
 * erreur ou réponse vide plutôt que de faire échouer l'appelant.
 */
export async function geocodeAddress(query: string): Promise<GeocodedAddress | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;

  const upstreamUrl = new URL(IGN_SEARCH_URL);
  upstreamUrl.searchParams.set("q", trimmed);
  upstreamUrl.searchParams.set("index", "address");
  upstreamUrl.searchParams.set("limit", "1");

  try {
    const upstreamResponse = await fetch(upstreamUrl, { signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
    if (!upstreamResponse.ok) return null;

    const rawBody: unknown = await upstreamResponse.json();
    const parsedBody = rawResponseSchema.safeParse(rawBody);
    if (!parsedBody.success) return null;

    const [best] = normalizeGeocodedFeatures(parsedBody.data.features);
    return best ?? null;
  } catch {
    return null;
  }
}
