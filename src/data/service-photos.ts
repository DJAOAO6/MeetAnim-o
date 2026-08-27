import type { PublicAnimalType } from "@/data/public-booking";

// Photos génériques (libres de droits, Unsplash) utilisées tant que le
// professionnel n'a pas uploadé sa propre photo pour une prestation.
// Recadrées en carré pour l'avatar circulaire des cartes de prestation.
export const defaultServicePhotoBySpecies: Record<PublicAnimalType, string> = {
  Chien: "https://images.unsplash.com/photo-1558788353-f76d92427f16?w=240&h=240&fit=crop&q=80&auto=format",
  Chat: "https://images.unsplash.com/photo-1677030960206-249628309d11?w=240&h=240&fit=crop&q=80&auto=format",
  Cheval: "https://images.unsplash.com/photo-1653304445078-ad6de9ed78c8?w=240&h=240&fit=crop&q=80&auto=format",
  NAC: "https://images.unsplash.com/photo-1511542229800-663a99ca1817?w=240&h=240&fit=crop&q=80&auto=format",
  "Petit ruminant": "https://images.unsplash.com/photo-1762357125972-62a8a5154ff2?w=240&h=240&fit=crop&q=80&auto=format",
};

export function servicePhotoFor(photoUrl: string | null | undefined, primarySpecies: PublicAnimalType): string {
  return photoUrl && photoUrl.trim().length > 0 ? photoUrl : defaultServicePhotoBySpecies[primarySpecies];
}
