"use client";

import { useRef, useState, type ReactNode } from "react";

export type SheetSnap = "compact" | "mid" | "full";

// Part de la hauteur de la carte occupée par le panneau.
const SNAP_SHARE: Record<SheetSnap, number> = { compact: 0.2, mid: 0.5, full: 0.88 };
const SNAPS: SheetSnap[] = ["compact", "mid", "full"];
const NEXT_ON_TAP: Record<SheetSnap, SheetSnap> = { compact: "mid", mid: "full", full: "mid" };
// En deçà, un geste sur la poignée est un appui, pas un glisser.
const DRAG_THRESHOLD_PX = 6;

/**
 * Panneau posé sur la carte, sur téléphone (façon Plans / Google Maps) :
 * trois hauteurs — un résumé, quelques résultats, la liste complète.
 *
 * Le panneau est à côté de la carte dans le DOM, pas dedans : glisser le
 * panneau ne déplace jamais la carte, et glisser la carte ne touche pas au
 * panneau. Seule la poignée se tire (touch-action: none) ; le contenu, lui,
 * défile normalement, sans entraîner la page (overscroll contenu).
 */
export function MapBottomSheet({ snap, onSnapChange, summary, label, children }: {
  snap: SheetSnap;
  onSnapChange: (snap: SheetSnap) => void;
  summary?: ReactNode;
  label: string;
  children: ReactNode;
}) {
  const sheetRef = useRef<HTMLElement>(null);
  const dragRef = useRef<{ pointerId: number; startY: number; startHeight: number; containerHeight: number; dragging: boolean } | null>(null);
  const [dragHeight, setDragHeight] = useState<number | null>(null);

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    const sheet = sheetRef.current;
    const container = sheet?.parentElement;
    if (!sheet || !container) return;
    dragRef.current = { pointerId: event.pointerId, startY: event.clientY, startHeight: sheet.offsetHeight, containerHeight: container.clientHeight, dragging: false };
    // Capturé dès l'appui : le doigt sort vite de la poignée, le glisser doit
    // continuer à lui parvenir.
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const delta = drag.startY - event.clientY;
    if (!drag.dragging) {
      if (Math.abs(delta) < DRAG_THRESHOLD_PX) return;
      drag.dragging = true;
    }
    const min = drag.containerHeight * 0.12;
    const max = drag.containerHeight * 0.92;
    setDragHeight(Math.min(max, Math.max(min, drag.startHeight + delta)));
  }

  function handlePointerEnd(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    // Simple appui (pointeur capturé : le clic ne parvient pas au bouton).
    if (!drag.dragging || dragHeight === null) {
      if (event.type === "pointerup") onSnapChange(NEXT_ON_TAP[snap]);
      setDragHeight(null);
      return;
    }
    const share = dragHeight / drag.containerHeight;
    const nearest = SNAPS.reduce((best, candidate) => (Math.abs(SNAP_SHARE[candidate] - share) < Math.abs(SNAP_SHARE[best] - share) ? candidate : best), snap);
    setDragHeight(null);
    onSnapChange(nearest);
  }

  return (
    <section
      ref={sheetRef}
      aria-label={label}
      data-testid="map-sheet"
      data-snap={snap}
      className={`absolute inset-x-0 bottom-0 z-10 flex flex-col rounded-t-3xl border-t border-animeo-border bg-white shadow-[0_-12px_30px_rgb(var(--theme-shadow-rgb)/0.16)] ${dragHeight === null ? "transition-[height] duration-200 ease-out motion-reduce:transition-none" : ""}`}
      style={{ height: dragHeight ?? `${SNAP_SHARE[snap] * 100}%` }}
    >
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        className="shrink-0 cursor-grab touch-none select-none px-4 pb-2 pt-1.5 active:cursor-grabbing"
      >
        <button
          type="button"
          // Clavier seulement (detail = 0) : au doigt et à la souris, l'appui
          // est traité par la poignée, qui capture le pointeur.
          onClick={(event) => { if (event.detail === 0) onSnapChange(NEXT_ON_TAP[snap]); }}
          aria-label={snap === "full" ? "Réduire le panneau" : "Agrandir le panneau"}
          data-drag-handle
          className="mx-auto flex h-7 w-20 items-center justify-center rounded-full"
        >
          <span aria-hidden="true" className="block h-1.5 w-10 rounded-full bg-animeo-border-strong" />
        </button>
        {summary}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)]">{children}</div>
    </section>
  );
}
