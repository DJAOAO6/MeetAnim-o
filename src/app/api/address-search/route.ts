import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { normalizeGeocodedFeatures } from "@/lib/maps/geocoding-provider";

// Service de géocodage de la Géoplateforme IGN (successeur de l'ancienne
// api-adresse.data.gouv.fr, dépréciée). Pas de clé nécessaire, limité à
// 50 req/s par IP — largement suffisant pour une autocomplétion débitée
// côté client. Le mode autocomplete=1 renvoie directement les coordonnées
// géocodées avec chaque suggestion, ce qui évite un second appel.
//
// Appel HTTP fait ici plutôt que via searchAddresses() du provider partagé :
// ce endpoint distingue "aucun résultat" de "erreur réseau/amont" pour
// l'UI (address-autocomplete.tsx affiche un état différent), alors que
// searchAddresses() dégrade silencieusement en tableau vide pour les
// usages serveur (tournées) qui n'ont pas besoin de cette distinction.
const IGN_SEARCH_URL = "https://data.geopf.fr/geocodage/search";
const UPSTREAM_TIMEOUT_MS = 4000;
const MIN_QUERY_LENGTH = 3;
const MAX_RESULTS = 5;

const querySchema = z.string().trim().min(MIN_QUERY_LENGTH).max(200);

const rawResponseSchema = z.object({
  features: z.array(z.unknown()),
});

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

    return NextResponse.json({ results: normalizeGeocodedFeatures(parsedBody.data.features) });
  } catch {
    // Le service IGN peut être temporairement indisponible : on dégrade
    // proprement plutôt que de bloquer le formulaire de réservation.
    return NextResponse.json({ results: [], error: "network" });
  }
}
