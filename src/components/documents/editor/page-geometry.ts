import type { DocumentPageSize } from "@/lib/documents/content";

// 96 DPI, format A4 (210×297mm) — assez grand pour éditer confortablement à
// l'écran, mis à l'échelle CSS par le conteneur plutôt que par un zoom Konva
// (pas de pan/zoom en étape 2, voir le plan — le canevas tient toujours en
// entier dans son conteneur).
export const PAGE_DIMENSIONS: Record<DocumentPageSize, { width: number; height: number }> = {
  A4_PORTRAIT: { width: 794, height: 1123 },
  A4_LANDSCAPE: { width: 1123, height: 794 },
};
