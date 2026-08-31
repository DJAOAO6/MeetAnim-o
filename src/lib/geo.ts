const BOUNDS = { minLat: 49.15, maxLat: 50.0, minLng: -0.05, maxLng: 1.35 };

export function projectToPercent(lat: number, lng: number): { x: number; y: number } {
  const x = ((lng - BOUNDS.minLng) / (BOUNDS.maxLng - BOUNDS.minLng)) * 100;
  const y = 100 - ((lat - BOUNDS.minLat) / (BOUNDS.maxLat - BOUNDS.minLat)) * 100;
  return { x: Math.min(95, Math.max(5, x)), y: Math.min(95, Math.max(5, y)) };
}

export function jitterCoordinates(base: { lat: number; lng: number }, seed: string): { lat: number; lng: number } {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  const angle = (hash % 360) * (Math.PI / 180);
  const distance = 0.004 + ((hash >> 8) % 100 / 100) * 0.006;
  return { lat: base.lat + Math.cos(angle) * distance, lng: base.lng + Math.sin(angle) * distance };
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
