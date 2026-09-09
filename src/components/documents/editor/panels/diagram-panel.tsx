"use client";

import { useDocumentStore } from "@/components/documents/editor/document-store";
import { StudioPanel, StudioSectionLabel } from "@/components/documents/editor/studio-chrome";
import { DEFAULT_POSITION, newElementId } from "@/components/documents/editor/element-factory";
import { AVAILABLE_ANATOMY_VIEWS } from "@/lib/anatomy/views";

/**
 * Insertion d'un schéma anatomique (étape 31). L'ancien « Schéma (chien) »
 * — silhouette dessinée à la main, repères à coordonnées libres — n'est plus
 * insérable : les documents qui en contiennent continuent de s'afficher,
 * mais rien n'en crée de nouveau (voir DocumentDiagramElement, content.ts).
 */
export function DiagramPanel({ readOnly }: { readOnly: boolean }) {
  const addElement = useDocumentStore((state) => state.addElement);

  return (
    <StudioPanel id="studio-panel-diagram" title="Schémas">
      <div>
        <StudioSectionLabel>Chien</StudioSectionLabel>
        <div className="flex flex-col gap-2">
          {AVAILABLE_ANATOMY_VIEWS.map((view) => (
            <button
              key={view.id}
              type="button"
              onClick={() =>
                addElement({
                  id: newElementId("anatomy"),
                  type: "anatomy",
                  ...DEFAULT_POSITION,
                  // Presque toute la largeur utile d'une A4 (714 px entre
                  // marges) : les gouttières de libellés occupent un tiers du
                  // cadre, sous ~650 px les noms de zones deviennent illisibles.
                  width: 700,
                  height: 300,
                  rotation: 0,
                  viewId: view.id,
                  observations: [],
                  showLabels: true,
                })
              }
              disabled={readOnly}
              className="flex w-full items-center gap-2 rounded-md border border-neutral-200 px-3 py-2.5 text-left text-sm font-semibold text-neutral-700 transition hover:border-animeo hover:bg-animeo-soft disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ViewIcon mirrored={view.sideVisible === "right"} />
              {view.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs leading-relaxed text-neutral-500">
          Les vues dorsale et ventrale, et les autres espèces, viendront avec leurs illustrations.
        </p>
      </div>
    </StudioPanel>
  );
}

function ViewIcon({ mirrored }: { mirrored: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4 shrink-0"
      style={mirrored ? { transform: "scaleX(-1)" } : undefined}
    >
      <path d="M4 9h9a3 3 0 0 1 3 3v2" />
      <path d="M16 11h3a1 1 0 0 1 1 1v3" />
      <path d="M6 9v5M13 14v4M19 15v3" />
      <circle cx="4" cy="8" r="1.6" />
    </svg>
  );
}
