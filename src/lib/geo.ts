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
