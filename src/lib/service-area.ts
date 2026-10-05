import { haversineDistanceKm } from "@/lib/geo";

/**
 * Secteur d'intervention (chantier C4) : une commune de départ et un rayon.
 * Il donne le texte affiché sur la page publique, et permet de prévenir —
 * sans bloquer — un client qui réserve à domicile au-delà.
 */

export const SERVICE_AREA_RADII = [10, 20, 30, 50, 80] as const;

export type ServiceArea = {
  label: string;
  latitude: number;
  longitude: number;
  /** null : pas de limite de distance. */
  radiusKm: number | null;
};

/** Le secteur d'un profil, s'il en a un (commune choisie avec ses coordonnées). */
export function serviceAreaOf(profile: { serviceAreaLabel: string | null; serviceAreaLatitude: number | null; serviceAreaLongitude: number | null; serviceAreaRadiusKm: number | null }): ServiceArea | null {
  if (!profile.serviceAreaLabel || profile.serviceAreaLatitude === null || profile.serviceAreaLongitude === null) return null;
  return { label: profile.serviceAreaLabel, latitude: profile.serviceAreaLatitude, longitude: profile.serviceAreaLongitude, radiusKm: profile.serviceAreaRadiusKm };
}

/** Un secteur reçu d'un formulaire, contrôlé : commune nommée, coordonnées valides, rayon de la liste. */
export function cleanServiceArea(input: { serviceAreaLabel?: string | null; serviceAreaLatitude?: number | null; serviceAreaLongitude?: number | null; serviceAreaRadiusKm?: number | null }): ServiceArea | null {
  const label = input.serviceAreaLabel?.trim().slice(0, 120);
  const latitude = input.serviceAreaLatitude;
  const longitude = input.serviceAreaLongitude;
  if (!label || typeof latitude !== "number" || typeof longitude !== "number" || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  const radius = input.serviceAreaRadiusKm;
  const radiusKm = radius && (SERVICE_AREA_RADII as readonly number[]).includes(radius) ? radius : null;
  return { label, latitude, longitude, radiusKm };
}

/** Le texte public : « Se déplace jusqu'à 30 km autour de Rouen ». */
export function serviceAreaText(area: { label: string; radiusKm: number | null }): string {
  return area.radiusKm ? `Se déplace jusqu’à ${area.radiusKm} km autour de ${area.label}` : `Se déplace autour de ${area.label}, sans limite de distance`;
}

/**
 * Distance d'une adresse au point de départ, si elle dépasse le rayon ;
 * null si elle est dans le secteur, ou si l'on ne peut pas le dire (pas de
 * secteur, pas de limite, adresse non localisée).
 */
export function outsideServiceArea(area: ServiceArea | null, point: { lat: number; lng: number } | null | undefined): number | null {
  if (!area || !area.radiusKm || !point) return null;
  const distance = haversineDistanceKm({ lat: area.latitude, lng: area.longitude }, point);
  return distance > area.radiusKm ? Math.round(distance) : null;
}

/** Message au client, non bloquant. */
export function outsideServiceAreaMessage(distanceKm: number, area: { label: string; radiusKm: number | null }): string {
  return `Votre adresse est à environ ${distanceKm} km de ${area.label}, au-delà du secteur habituel (${area.radiusKm} km). Vous pouvez envoyer votre demande : le professionnel vous confirmera s’il peut se déplacer.`;
}
