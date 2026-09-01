// Fond de carte : configurable via NEXT_PUBLIC_MAP_STYLE_URL (variable
// publique — c'est une URL de style, pas un secret, et MapLibre l'utilise
// depuis le navigateur). Par défaut OpenFreeMap (aucune clé, aucun compte),
// remplaçable plus tard par un fournisseur commercial, la Géoplateforme ou
// un style auto-hébergé sans toucher au reste de la page Tournées.
export function getMapStyleUrl(): string {
  return process.env.NEXT_PUBLIC_MAP_STYLE_URL?.trim() || "https://tiles.openfreemap.org/styles/liberty";
}

export function formatDistanceMeters(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  const km = meters / 1000;
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
}

export function formatDurationSeconds(seconds: number): string {
  const totalMinutes = Math.round(seconds / 60);
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `${hours}h` : `${hours}h${String(minutes).padStart(2, "0")}`;
}

export function metersToKilometers(meters: number): number {
  return Math.round((meters / 1000) * 10) / 10;
}
