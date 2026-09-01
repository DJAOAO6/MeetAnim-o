import "server-only";
import { z } from "zod";
import type { GeocodeSuggestion, ReverseGeocodeResult } from "@/lib/maps/map-types";

// Service de géocodage actuel de la Géoplateforme IGN (successeur de l'ancien
// api-adresse.data.gouv.fr, retiré). Gratuit, sans clé, ~50 req/s par IP —
// suffisant pour une autocomplétion débitée côté client comme pour les
// besoins serveur (tournées, profil du cabinet). Toute la logique d'appel
// vit ici : /api/address-search et business-profile-actions.ts consomment
// ce module plutôt que de dupliquer l'appel HTTP.
const IGN_SEARCH_URL = "https://data.geopf.fr/geocodage/search";
const IGN_REVERSE_URL = "https://data.geopf.fr/geocodage/reverse";
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

const suggestionSchema = z.object({
  id: z.string(),
  label: z.string(),
  houseNumber: z.string().optional(),
  street: z.string().optional(),
  postcode: z.string().regex(/^\d{5}$/),
  city: z.string().min(1),
  citycode: z.string().optional(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

const rawResponseSchema = z.object({
  features: z.array(z.unknown()),
});

/**
 * Convertit et valide chaque feature brute renvoyée par l'IGN — données
 * externes, jamais relayées sans passer par le schéma de validation.
 */
export function normalizeGeocodedFeatures(rawFeatures: unknown[]): GeocodeSuggestion[] {
  const results: GeocodeSuggestion[] = [];

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

    const parsedResult = suggestionSchema.safeParse(candidate);
    if (parsedResult.success) results.push(parsedResult.data);
  }

  return results;
}

/**
 * Autocomplétion adresse (barre de recherche, ajout d'étape manuelle) —
 * jamais bloquant : renvoie un tableau vide sur toute erreur.
 */
export async function searchAddresses(query: string, limit = 5): Promise<GeocodeSuggestion[]> {
  const trimmed = query.trim();
  if (trimmed.length < 3) return [];

  const upstreamUrl = new URL(IGN_SEARCH_URL);
  upstreamUrl.searchParams.set("q", trimmed);
  upstreamUrl.searchParams.set("index", "address");
  upstreamUrl.searchParams.set("autocomplete", "1");
  upstreamUrl.searchParams.set("limit", String(Math.min(Math.max(limit, 1), 7)));

  try {
    const upstreamResponse = await fetch(upstreamUrl, { signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
    if (!upstreamResponse.ok) return [];

    const rawBody: unknown = await upstreamResponse.json();
    const parsedBody = rawResponseSchema.safeParse(rawBody);
    if (!parsedBody.success) return [];

    return normalizeGeocodedFeatures(parsedBody.data.features);
  } catch {
    return [];
  }
}

/**
 * Géocode une adresse déjà complète (un seul résultat attendu) — utilisé
 * pour le cabinet et pour valider une adresse saisie manuellement dans une
 * tournée.
 */
export async function geocodeAddress(query: string): Promise<GeocodeSuggestion | null> {
  const results = await searchAddresses(query, 1);
  return results[0] ?? null;
}

/**
 * Géocodage inverse : coordonnées → adresse approximative la plus proche.
 * Utilisé pour "Ajouter une étape ici" (clic carte) et le déplacement d'un
 * marker d'étape manuelle.
 */
export async function reverseGeocode(latitude: number, longitude: number): Promise<ReverseGeocodeResult | null> {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;

  const upstreamUrl = new URL(IGN_REVERSE_URL);
  upstreamUrl.searchParams.set("lon", String(longitude));
  upstreamUrl.searchParams.set("lat", String(latitude));
  upstreamUrl.searchParams.set("index", "address");
  upstreamUrl.searchParams.set("limit", "1");

  try {
    const upstreamResponse = await fetch(upstreamUrl, { signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
    if (!upstreamResponse.ok) return null;

    const rawBody: unknown = await upstreamResponse.json();
    const parsedBody = rawResponseSchema.safeParse(rawBody);
    if (!parsedBody.success) return null;

    const [best] = normalizeGeocodedFeatures(parsedBody.data.features);
    if (!best) return null;

    return {
      label: best.label,
      postcode: best.postcode,
      city: best.city,
      latitude: best.latitude,
      longitude: best.longitude,
    };
  } catch {
    return null;
  }
}
