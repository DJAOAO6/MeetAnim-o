"use client";

import { useDocumentStore } from "@/components/documents/editor/document-store";
import { StudioPanel, StudioSectionLabel } from "@/components/documents/editor/studio-chrome";
import { DEFAULT_POSITION, newElementId } from "@/components/documents/editor/element-factory";

export function DiagramPanel({ readOnly }: { readOnly: boolean }) {
  const addElement = useDocumentStore((state) => state.addElement);

  function addDogDiagram() {
    addElement({ id: newElementId("diagram"), type: "diagram", ...DEFAULT_POSITION, width: 380, height: 250, rotation: 0, species: "dog", view: "profile-left", markers: [], showLegend: true });
  }

  return (
    <StudioPanel id="studio-panel-diagram" title="Schémas">
      <div>
        <StudioSectionLabel>Ajouter</StudioSectionLabel>
        <button
          type="button"
          onClick={addDogDiagram}
          disabled={readOnly}
          className="flex w-full items-center gap-2 rounded-md border border-neutral-200 px-3 py-2.5 text-left text-sm font-semibold text-neutral-700 transition hover:border-animeo hover:bg-animeo-soft disabled:cursor-not-allowed disabled:opacity-40"
        >
          <DogIcon />
          Schéma (chien)
        </button>
        <p className="mt-2 text-xs leading-relaxed text-neutral-500">D&apos;autres espèces et vues arriveront ensuite.</p>
      </div>
    </StudioPanel>
  );
}

function DogIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0">
      <path d="M6 10c-1.5-1-2.5-.5-2.5 1S5 13 6 12.5" />
      <path d="M6 10c0-3 2.5-5 6-5s6 2.5 6 6c0 3-1.5 4.5-1.5 7.5H8c0-2.5-2-3.5-2-6.5Z" />
      <circle cx="9.5" cy="9.5" r="0.8" fill="currentColor" />
    </svg>
  );
}
