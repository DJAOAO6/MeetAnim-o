export type PlaceType = "commune" | "departement" | "region";

export type PlaceResult = {
  id: string;
  label: string;
  type: PlaceType;
  context: string;
  lat: number;
  lng: number;
  zoom: number;
  // Phase 3 quater : premier code postal de la commune (une commune peut en
  // avoir plusieurs — celui-ci suffit pour "ville d'une zone", qui n'en
  // retient qu'un seul par ville, comme le reste de l'app). Absent pour un
  // département/une région, qui n'ont pas de code postal.
  postalCode?: string;
};

type GeoPoint = { type: "Point"; coordinates: [number, number] };

type CommuneApiResult = {
  nom: string;
  code: string;
  centre?: GeoPoint;
  departement?: { code: string; nom: string };
  codesPostaux?: string[];
};

type DepartementOrRegionApiResult = {
  nom: string;
  code: string;
  chefLieu?: string;
};

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export async function searchPlaces(query: string, signal?: AbortSignal): Promise<PlaceResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];
  const encoded = encodeURIComponent(trimmed);

  const [communes, departements, regions] = await Promise.all([
    fetchJson<CommuneApiResult[]>(`https://geo.api.gouv.fr/communes?nom=${encoded}&fields=nom,code,centre,departement,codesPostaux&boost=population&limit=5`),
    fetchJson<DepartementOrRegionApiResult[]>(`https://geo.api.gouv.fr/departements?nom=${encoded}&fields=nom,code,chefLieu&limit=3`),
    fetchJson<DepartementOrRegionApiResult[]>(`https://geo.api.gouv.fr/regions?nom=${encoded}&fields=nom,code,chefLieu&limit=3`),
  ]);

  if (signal?.aborted) return [];

  const communeResults: PlaceResult[] = (communes ?? [])
    .filter((commune): commune is CommuneApiResult & { centre: GeoPoint } => Boolean(commune.centre))
    .map((commune) => ({
      id: `commune-${commune.code}`,
      label: commune.nom,
      type: "commune",
      context: commune.departement ? `${commune.departement.code} · ${commune.departement.nom}` : "Commune",
      lat: commune.centre.coordinates[1],
      lng: commune.centre.coordinates[0],
      zoom: 12,
      postalCode: commune.codesPostaux?.[0],
    }));

  const zones: Array<DepartementOrRegionApiResult & { type: Exclude<PlaceType, "commune"> }> = [
    ...(departements ?? []).map((item) => ({ ...item, type: "departement" as const })),
    ...(regions ?? []).map((item) => ({ ...item, type: "region" as const })),
  ].filter((item) => item.chefLieu);

  const zoneResults = await Promise.all(
    zones.map(async (zone) => {
      const commune = await fetchJson<CommuneApiResult>(`https://geo.api.gouv.fr/communes/${zone.chefLieu}?fields=nom,centre`);
      if (!commune?.centre) return null;
      const result: PlaceResult = {
        id: `${zone.type}-${zone.code}`,
        label: zone.nom,
        type: zone.type,
        context: zone.type === "departement" ? `Département ${zone.code}` : "Région",
        lat: commune.centre.coordinates[1],
        lng: commune.centre.coordinates[0],
        zoom: zone.type === "departement" ? 9 : 8,
      };
      return result;
    }),
  );

  if (signal?.aborted) return [];

  return [...communeResults, ...zoneResults.filter((item): item is PlaceResult => item !== null)];
}
