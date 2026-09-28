import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/dal";
import { geometryBounds, simplifyGeometry, type GeoBounds, type TerritoryGeometry } from "@/lib/geo";

/**
 * Contour d'un territoire, pour la carte clients : commune, département ou
 * région, allégé et mis en cache.
 *
 * Sources officielles, sans clé :
 *  - commune : geo.api.gouv.fr (contour fourni directement, léger) ;
 *  - département et région : Géoplateforme IGN, Admin Express (geo.api.gouv
 *    .fr ne fournit pas leur géométrie). Réponse lente et variable (1 à
 *    30 s) : d'où le cache, les contours ne changeant qu'une fois par an.
 *
 * Réservée aux comptes connectés : ce n'est pas un relais public.
 */

const TYPES = ["commune", "departement", "region"] as const;
type TerritoryType = (typeof TYPES)[number];

const querySchema = z.object({
  type: z.enum(TYPES),
  // Codes INSEE : 5 caractères pour une commune (2A/2B en Corse), 2 à 3 pour
  // un département, 2 pour une région.
  code: z.string().regex(/^[0-9AB]{2,5}$/),
});

// Tolérance de simplification, en degrés : ~20 m pour une commune, ~150 m
// pour un département, ~300 m pour une région.
const TOLERANCE: Record<TerritoryType, number> = { commune: 0.0002, departement: 0.0015, region: 0.003 };
const IGN_WFS = "https://data.geopf.fr/wfs/ows";
const IGN_LAYERS: Record<Exclude<TerritoryType, "commune">, string[]> = {
  // Petite échelle d'abord pour une région (≈ 50 ko), échelle normale en repli.
  region: ["ADMINEXPRESS-COG-CARTO-PE.LATEST:region", "ADMINEXPRESS-COG-CARTO.LATEST:region"],
  departement: ["ADMINEXPRESS-COG-CARTO.LATEST:departement", "ADMINEXPRESS-COG-CARTO-PE.LATEST:departement"],
};
const TIMEOUT_MS = 25_000;

type Territory = { geometry: TerritoryGeometry; bounds: GeoBounds };
// Cache du processus : un contour déjà servi ne repart jamais chez l'IGN.
const cache = new Map<string, Territory>();

const geometrySchema = z.union([
  z.object({ type: z.literal("Polygon"), coordinates: z.array(z.array(z.tuple([z.number(), z.number()]))) }),
  z.object({ type: z.literal("MultiPolygon"), coordinates: z.array(z.array(z.array(z.tuple([z.number(), z.number()])))) }),
]);

async function fetchGeometry(url: string): Promise<TerritoryGeometry | null> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!response.ok) return null;
    const body = (await response.json()) as { geometry?: unknown; features?: Array<{ geometry?: unknown }> };
    const parsed = geometrySchema.safeParse(body.features?.[0]?.geometry ?? body.geometry);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

async function loadTerritory(type: TerritoryType, code: string): Promise<Territory | null> {
  let geometry: TerritoryGeometry | null = null;
  if (type === "commune") {
    geometry = await fetchGeometry(`https://geo.api.gouv.fr/communes/${code}?format=geojson&geometry=contour`);
  } else {
    for (const layer of IGN_LAYERS[type]) {
      const url = new URL(IGN_WFS);
      url.searchParams.set("service", "WFS");
      url.searchParams.set("version", "2.0.0");
      url.searchParams.set("request", "GetFeature");
      url.searchParams.set("typeNames", layer);
      url.searchParams.set("outputFormat", "application/json");
      url.searchParams.set("CQL_FILTER", `code_insee='${code}'`);
      geometry = await fetchGeometry(url.toString());
      if (geometry) break;
    }
  }
  if (!geometry) return null;
  const simplified = simplifyGeometry(geometry, TOLERANCE[type]);
  return { geometry: simplified, bounds: geometryBounds(simplified) };
}

export async function GET(request: NextRequest) {
  if (!(await getCurrentUser())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = querySchema.safeParse({ type: request.nextUrl.searchParams.get("type"), code: request.nextUrl.searchParams.get("code") });
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });

  const key = `${parsed.data.type}:${parsed.data.code}`;
  let territory = cache.get(key) ?? null;
  if (!territory) {
    territory = await loadTerritory(parsed.data.type, parsed.data.code);
    if (!territory) return NextResponse.json({ error: "unavailable" }, { status: 502 });
    cache.set(key, territory);
  }
  return NextResponse.json(territory, { headers: { "Cache-Control": "private, max-age=86400" } });
}
