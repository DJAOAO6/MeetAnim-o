"use client";

import { useDocumentStore } from "@/components/documents/editor/document-store";

const TOOLBAR_HEIGHT = 38;

/**
 * Barre d'alignement/distribution flottante (étape 14) — affichée uniquement
 * quand la sélection contient au moins 2 éléments, ancrée au-dessus de la
 * boîte englobante de la sélection, mêmes coordonnées non mises à l'échelle
 * que le reste (hérite donc du zoom automatiquement, voir document-editor-view.tsx).
 * Distribuer est désactivé sous 3 éléments — voir document-store.ts,
 * distributeSelected (2 éléments n'ont qu'un seul intervalle, rien à égaliser).
 */
export function AlignmentToolbar({ readOnly }: { readOnly: boolean }) {
  const content = useDocumentStore((state) => state.content);
  const currentPageIndex = useDocumentStore((state) => state.currentPageIndex);
  const selectedElementIds = useDocumentStore((state) => state.selectedElementIds);
  const alignSelected = useDocumentStore((state) => state.alignSelected);
  const distributeSelected = useDocumentStore((state) => state.distributeSelected);

  const page = content.pages[currentPageIndex];
  const selectedIds = new Set(selectedElementIds);
  const selected = page?.elements.filter((element) => selectedIds.has(element.id)) ?? [];

  if (readOnly || selected.length < 2) return null;

  const left = Math.min(...selected.map((element) => element.x));
  const right = Math.max(...selected.map((element) => element.x + element.width));
  const top = Math.min(...selected.map((element) => element.y));

  return (
    <div
      role="toolbar"
      aria-label="Alignement et distribution"
      style={{ position: "absolute", left, top: Math.max(0, top - TOOLBAR_HEIGHT - 6), width: right - left, height: TOOLBAR_HEIGHT, pointerEvents: "auto" }}
      className="flex items-center justify-center gap-1 rounded-md border border-neutral-200 bg-white px-1.5 shadow-sm"
    >
      <ToolbarButton label="Aligner à gauche" onClick={() => alignSelected("left")}><AlignEdgeIcon axis="x" variant="start" /></ToolbarButton>
      <ToolbarButton label="Centrer horizontalement" onClick={() => alignSelected("centerX")}><AlignEdgeIcon axis="x" variant="center" /></ToolbarButton>
      <ToolbarButton label="Aligner à droite" onClick={() => alignSelected("right")}><AlignEdgeIcon axis="x" variant="end" /></ToolbarButton>

      <Divider />

      <ToolbarButton label="Aligner en haut" onClick={() => alignSelected("top")}><AlignEdgeIcon axis="y" variant="start" /></ToolbarButton>
      <ToolbarButton label="Centrer verticalement" onClick={() => alignSelected("centerY")}><AlignEdgeIcon axis="y" variant="center" /></ToolbarButton>
      <ToolbarButton label="Aligner en bas" onClick={() => alignSelected("bottom")}><AlignEdgeIcon axis="y" variant="end" /></ToolbarButton>

      <Divider />

      <ToolbarButton label="Distribuer horizontalement" disabled={selected.length < 3} onClick={() => distributeSelected("horizontal")}>
        <DistributeIcon axis="x" />
      </ToolbarButton>
      <ToolbarButton label="Distribuer verticalement" disabled={selected.length < 3} onClick={() => distributeSelected("vertical")}>
        <DistributeIcon axis="y" />
      </ToolbarButton>
    </div>
  );
}

function ToolbarButton({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-neutral-600 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span aria-hidden="true" className="mx-0.5 h-5 w-px shrink-0 bg-neutral-200" />;
}

function AlignEdgeIcon({ axis, variant }: { axis: "x" | "y"; variant: "start" | "center" | "end" }) {
  // Une ligne d'ancrage (le bord/centre visé) + 2 rectangles représentant les
  // éléments alignés dessus — même esprit que AlignIcon de text-format-toolbar.tsx.
  if (axis === "x") {
    const anchorX = { start: 4, center: 12, end: 20 }[variant];
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" className="h-3.5 w-3.5">
        <path d={`M${anchorX} 3v18`} />
        <rect x={variant === "end" ? anchorX - 8 : anchorX} y="6" width="8" height="4" rx="1" fill="currentColor" stroke="none" opacity="0.8" transform={variant === "center" ? `translate(-4,0)` : undefined} />
        <rect x={variant === "end" ? anchorX - 5 : anchorX} y="14" width="5" height="4" rx="1" fill="currentColor" stroke="none" opacity="0.8" transform={variant === "center" ? `translate(-2.5,0)` : undefined} />
      </svg>
    );
  }
  const anchorY = { start: 4, center: 12, end: 20 }[variant];
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" className="h-3.5 w-3.5">
      <path d={`M3 ${anchorY}h18`} />
      <rect x="6" y={variant === "end" ? anchorY - 8 : anchorY} width="4" height="8" rx="1" fill="currentColor" stroke="none" opacity="0.8" transform={variant === "center" ? `translate(0,-4)` : undefined} />
      <rect x="14" y={variant === "end" ? anchorY - 5 : anchorY} width="4" height="5" rx="1" fill="currentColor" stroke="none" opacity="0.8" transform={variant === "center" ? `translate(0,-2.5)` : undefined} />
    </svg>
  );
}

function DistributeIcon({ axis }: { axis: "x" | "y" }) {
  if (axis === "x") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" className="h-3.5 w-3.5">
        <rect x="2" y="7" width="4" height="10" rx="1" fill="currentColor" stroke="none" opacity="0.8" />
        <rect x="10" y="7" width="4" height="10" rx="1" fill="currentColor" stroke="none" opacity="0.8" />
        <rect x="18" y="7" width="4" height="10" rx="1" fill="currentColor" stroke="none" opacity="0.8" />
      </svg>
    );
  }
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" className="h-3.5 w-3.5">
      <rect x="7" y="2" width="10" height="4" rx="1" fill="currentColor" stroke="none" opacity="0.8" />
      <rect x="7" y="10" width="10" height="4" rx="1" fill="currentColor" stroke="none" opacity="0.8" />
      <rect x="7" y="18" width="10" height="4" rx="1" fill="currentColor" stroke="none" opacity="0.8" />
    </svg>
  );
}
