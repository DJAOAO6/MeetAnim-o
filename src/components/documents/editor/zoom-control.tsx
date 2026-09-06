"use client";

import { useDocumentStore, ZOOM_STEPS } from "@/components/documents/editor/document-store";

/**
 * Pastille flottante de zoom (étape 10) — bas-droite du conteneur du
 * canevas. `zoomLevel` est un `transform: scale()` CSS sur le conteneur
 * commun au Stage Konva et à la surcouche texte (voir document-editor-view.tsx),
 * jamais un état interne à Konva.
 */
export function ZoomControl() {
  const zoomLevel = useDocumentStore((state) => state.zoomLevel);
  const zoomIn = useDocumentStore((state) => state.zoomIn);
  const zoomOut = useDocumentStore((state) => state.zoomOut);
  const resetZoom = useDocumentStore((state) => state.resetZoom);

  const canZoomOut = zoomLevel > ZOOM_STEPS[0];
  const canZoomIn = zoomLevel < ZOOM_STEPS[ZOOM_STEPS.length - 1];

  return (
    <div className="pointer-events-auto absolute bottom-4 right-4 flex items-center gap-1 rounded-md border border-neutral-200 bg-white px-1.5 py-1 shadow-sm">
      <button
        type="button"
        aria-label="Diminuer le zoom"
        onClick={zoomOut}
        disabled={!canZoomOut}
        className="flex h-7 w-7 items-center justify-center rounded text-neutral-600 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-30"
      >
        −
      </button>
      <button
        type="button"
        onClick={resetZoom}
        aria-label="Réinitialiser le zoom à 100 %"
        className="min-w-[3.5rem] rounded px-1 text-center text-xs font-semibold text-neutral-700 transition hover:bg-neutral-100"
      >
        {Math.round(zoomLevel * 100)}%
      </button>
      <button
        type="button"
        aria-label="Augmenter le zoom"
        onClick={zoomIn}
        disabled={!canZoomIn}
        className="flex h-7 w-7 items-center justify-center rounded text-neutral-600 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-30"
      >
        +
      </button>
    </div>
  );
}
