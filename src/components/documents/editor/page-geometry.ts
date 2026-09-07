import type { DocumentPageSize } from "@/lib/documents/content";

// 96 DPI, format A4 (210×297mm) — assez grand pour éditer confortablement à
// l'écran, mis à l'échelle CSS par le conteneur plutôt que par un zoom Konva
// (pas de pan/zoom en étape 2, voir le plan — le canevas tient toujours en
// entier dans son conteneur). POSTER_A3_PORTRAIT suit la même convention 96
// DPI (A3 = 297×420mm, format physique/imprimable comme A4). Les formats
// SOCIAL_* sont en pixels natifs (pas dérivés d'un DPI d'impression — ils
// n'ont pas vocation à être imprimés) : SOCIAL_SQUARE = post Instagram carré
// 1:1, SOCIAL_PORTRAIT = ratio 4:5, le format de post portrait le plus
// courant (étape 26).
export const PAGE_DIMENSIONS: Record<DocumentPageSize, { width: number; height: number }> = {
  A4_PORTRAIT: { width: 794, height: 1123 },
  A4_LANDSCAPE: { width: 1123, height: 794 },
  POSTER_A3_PORTRAIT: { width: 1123, height: 1587 },
  SOCIAL_SQUARE: { width: 1080, height: 1080 },
  SOCIAL_PORTRAIT: { width: 1080, height: 1350 },
};
