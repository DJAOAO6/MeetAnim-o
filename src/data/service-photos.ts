import type { PublicAnimalType } from "@/data/public-booking";

// Photos génériques (Unsplash, licence libre) utilisées tant que le
// professionnel n'a pas mis sa propre photo pour une prestation. Recadrées en
// carré pour l'avatar circulaire des cartes de prestation.
//
// Servies par le site lui-même (public/photos-prestations) depuis le
// 20 octobre 2026 (audit 2026-10, FONC-09) : chargées depuis Unsplash, elles
// transmettaient l'adresse IP de chaque visiteur de la page de réservation à
// un tiers, et disparaissaient si ce site changeait.
export const defaultServicePhotoBySpecies: Record<PublicAnimalType, string> = {
  Chien: "/photos-prestations/chien.jpg",
  Chat: "/photos-prestations/chat.jpg",
  Cheval: "/photos-prestations/cheval.jpg",
  NAC: "/photos-prestations/nac.jpg",
  "Petit ruminant": "/photos-prestations/petit-ruminant.jpg",
};

/** Les anciennes adresses Unsplash, que des prestations ont pu enregistrer telles quelles. */
const legacyUnsplashPhotos: Record<string, string> = {
  "https://images.unsplash.com/photo-1558788353-f76d92427f16?w=240&h=240&fit=crop&q=80&auto=format": defaultServicePhotoBySpecies.Chien,
  "https://images.unsplash.com/photo-1677030960206-249628309d11?w=240&h=240&fit=crop&q=80&auto=format": defaultServicePhotoBySpecies.Chat,
  "https://images.unsplash.com/photo-1653304445078-ad6de9ed78c8?w=240&h=240&fit=crop&q=80&auto=format": defaultServicePhotoBySpecies.Cheval,
  "https://images.unsplash.com/photo-1511542229800-663a99ca1817?w=240&h=240&fit=crop&q=80&auto=format": defaultServicePhotoBySpecies.NAC,
  "https://images.unsplash.com/photo-1762357125972-62a8a5154ff2?w=240&h=240&fit=crop&q=80&auto=format": defaultServicePhotoBySpecies["Petit ruminant"],
};

export function servicePhotoFor(photoUrl: string | null | undefined, primarySpecies: PublicAnimalType): string {
  if (photoUrl && legacyUnsplashPhotos[photoUrl]) return legacyUnsplashPhotos[photoUrl];
  return photoUrl && photoUrl.trim().length > 0 ? photoUrl : defaultServicePhotoBySpecies[primarySpecies];
}
