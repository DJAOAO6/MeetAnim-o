const BOUNDS = { minLat: 49.15, maxLat: 50.0, minLng: -0.05, maxLng: 1.35 };

export function projectToPercent(lat: number, lng: number): { x: number; y: number } {
  const x = ((lng - BOUNDS.minLng) / (BOUNDS.maxLng - BOUNDS.minLng)) * 100;
  const y = 100 - ((lat - BOUNDS.minLat) / (BOUNDS.maxLat - BOUNDS.minLat)) * 100;
  return { x: Math.min(95, Math.max(5, x)), y: Math.min(95, Math.max(5, y)) };
}

export function haversineDistanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const earthRadiusKm = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * earthRadiusKm * Math.asin(Math.sqrt(h));
}

/**
 * Point situé à `distanceKm` de `origin` dans la direction `bearingDegrees`
 * (0° = nord, 90° = est) — inverse de haversineDistanceKm. Sert à placer la
 * poignée de redimensionnement du cercle de périmètre sur son bord (carte
 * clients, phase 3).
 */
export function destinationPoint(origin: { lat: number; lng: number }, distanceKm: number, bearingDegrees: number): { lat: number; lng: number } {
  const earthRadiusKm = 6371;
  const angularDistance = distanceKm / earthRadiusKm;
  const bearing = (bearingDegrees * Math.PI) / 180;
  const lat1 = (origin.lat * Math.PI) / 180;
  const lng1 = (origin.lng * Math.PI) / 180;

  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(angularDistance) + Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearing));
  const lng2 = lng1 + Math.atan2(
    Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat1),
    Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2),
  );

  return { lat: (lat2 * 180) / Math.PI, lng: (lng2 * 180) / Math.PI };
}

/** Position GeoJSON : [longitude, latitude]. */
export type GeoPosition = [number, number];

/** Contour d'un territoire (commune, département, région), en GeoJSON. */
export type TerritoryGeometry =
  | { type: "Polygon"; coordinates: GeoPosition[][] }
  | { type: "MultiPolygon"; coordinates: GeoPosition[][][] };

export type GeoBounds = { south: number; west: number; north: number; east: number };

function polygonsOf(geometry: TerritoryGeometry): GeoPosition[][][] {
  return geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
}

/** Lancer de rayon : le point est-il à l'intérieur de l'anneau ? */
function insideRing(point: { lat: number; lng: number }, ring: GeoPosition[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > point.lat !== yj > point.lat && point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Le point appartient-il au territoire ? Un polygone est fait d'un contour
 * extérieur et, éventuellement, de trous (enclaves) : dedans = dans le
 * contour et hors de tous ses trous, pour l'un des polygones.
 */
export function pointInGeometry(point: { lat: number; lng: number }, geometry: TerritoryGeometry): boolean {
  return polygonsOf(geometry).some(([outer, ...holes]) => insideRing(point, outer) && !holes.some((hole) => insideRing(point, hole)));
}

/** Rectangle englobant d'un territoire. */
export function geometryBounds(geometry: TerritoryGeometry): GeoBounds {
  const bounds = { south: 90, west: 180, north: -90, east: -180 };
  for (const polygon of polygonsOf(geometry)) {
    for (const [lng, lat] of polygon[0]) {
      bounds.south = Math.min(bounds.south, lat);
      bounds.north = Math.max(bounds.north, lat);
      bounds.west = Math.min(bounds.west, lng);
      bounds.east = Math.max(bounds.east, lng);
    }
  }
  return bounds;
}

/** Rectangle englobant d'un cercle de `radiusKm` autour de `center`. */
export function circleBounds(center: { lat: number; lng: number }, radiusKm: number): GeoBounds {
  return {
    north: destinationPoint(center, radiusKm, 0).lat,
    south: destinationPoint(center, radiusKm, 180).lat,
    east: destinationPoint(center, radiusKm, 90).lng,
    west: destinationPoint(center, radiusKm, 270).lng,
  };
}

/** Distance d'un point au segment [a, b], en degrés (suffisant pour simplifier). */
function segmentDistance(point: GeoPosition, a: GeoPosition, b: GeoPosition): number {
  const [x, y] = point;
  const [x1, y1] = a;
  const [x2, y2] = b;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared ? Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / lengthSquared)) : 0;
  return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy));
}

/** Douglas-Peucker sur un anneau fermé. */
function simplifyRing(ring: GeoPosition[], tolerance: number): GeoPosition[] {
  if (ring.length <= 4) return ring;
  const keep = new Array<boolean>(ring.length).fill(false);
  keep[0] = true;
  keep[ring.length - 1] = true;
  const stack: Array<[number, number]> = [[0, ring.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop()!;
    let farthest = -1;
    let farthestDistance = tolerance;
    for (let index = first + 1; index < last; index += 1) {
      const distance = segmentDistance(ring[index], ring[first], ring[last]);
      if (distance > farthestDistance) { farthest = index; farthestDistance = distance; }
    }
    if (farthest !== -1) {
      keep[farthest] = true;
      stack.push([first, farthest], [farthest, last]);
    }
  }
  const simplified = ring.filter((_, index) => keep[index]);
  // Un anneau doit garder au moins 4 positions (triangle fermé).
  return simplified.length >= 4 ? simplified : ring;
}

/**
 * Contour allégé : les points à moins de `tolerance` degrés de la ligne
 * sont retirés, les coordonnées arrondies à 5 décimales (≈ 1 m). Un contour
 * de département passe de ~7 000 points à quelques centaines, sans écart
 * visible à l'échelle d'une carte de secteur.
 */
export function simplifyGeometry(geometry: TerritoryGeometry, tolerance: number): TerritoryGeometry {
  const round = ([lng, lat]: GeoPosition): GeoPosition => [Math.round(lng * 1e5) / 1e5, Math.round(lat * 1e5) / 1e5];
  const polygons = polygonsOf(geometry).map((polygon) => polygon.map((ring) => simplifyRing(ring, tolerance).map(round)));
  return geometry.type === "Polygon" ? { type: "Polygon", coordinates: polygons[0] } : { type: "MultiPolygon", coordinates: polygons };
}
