import type { PublicAnimalType } from "@/data/public-booking";

// Palette reprise de prisma/seed.ts (AVATAR_BACKGROUNDS) pour garder un rendu
// cohérent entre les animaux de démo et ceux créés depuis la réservation
// publique.
export const AVATAR_BACKGROUNDS = [
  "from-[#dcefeb] to-[#f4faf8]",
  "from-animeo-warning-soft to-animeo-warning-soft",
  "from-[#e7edf4] to-[#f7f9fc]",
  "from-[#eee8f8] to-[#faf8fd]",
  "from-animeo-positive-soft to-animeo-surface-alt",
];

const speciesAvatar: Record<PublicAnimalType, string> = {
  Chien: "🐕",
  Chat: "🐈",
  Cheval: "🐎",
  NAC: "🐰",
  "Petit ruminant": "🐐",
};

export function avatarForSpecies(species: PublicAnimalType): string {
  return speciesAvatar[species] ?? "🐾";
}

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

export function avatarBackgroundFor(seed: string): string {
  const index = hashString(seed) % AVATAR_BACKGROUNDS.length;
  return AVATAR_BACKGROUNDS[index];
}
