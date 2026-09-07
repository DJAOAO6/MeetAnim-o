"use client";

import { useDocumentStore } from "@/components/documents/editor/document-store";
import { StudioPanel, StudioSectionLabel } from "@/components/documents/editor/studio-chrome";
import { DEFAULT_POSITION, newElementId } from "@/components/documents/editor/element-factory";
import type { DocumentShapeElement } from "@/lib/documents/content";

/**
 * Catégorie "Lignes" du rail (étape 20) — "Ligne" y déménage depuis Formes
 * (conceptuellement une ligne, pas une forme fermée). Flèche double n'est
 * pas un type distinct : même `shape:"arrow"` avec `doubleArrow:true`, voir
 * content.ts. Le pointillé se bascule après coup depuis Propriétés → Style,
 * pas un préréglage séparé ici.
 */
export function LinesPanel({ readOnly }: { readOnly: boolean }) {
  const addElement = useDocumentStore((state) => state.addElement);

  function insert(element: DocumentShapeElement) {
    addElement(element);
  }

  function addLine() {
    insert({ id: newElementId("shape"), type: "shape", shape: "line", ...DEFAULT_POSITION, width: 200, height: 2, rotation: 0, fill: "#183b45", stroke: "#183b45" });
  }

  function addArrow() {
    insert({ id: newElementId("shape"), type: "shape", shape: "arrow", ...DEFAULT_POSITION, width: 200, height: 2, rotation: 0, fill: "#183b45", stroke: "#183b45" });
  }

  function addDoubleArrow() {
    insert({ id: newElementId("shape"), type: "shape", shape: "arrow", ...DEFAULT_POSITION, width: 200, height: 2, rotation: 0, fill: "#183b45", stroke: "#183b45", doubleArrow: true });
  }

  function addChevron() {
    insert({ id: newElementId("shape"), type: "shape", shape: "chevron", ...DEFAULT_POSITION, width: 40, height: 60, rotation: 0, fill: "#183b45", stroke: "#183b45" });
  }

  const items = [
    { label: "Ligne", onClick: addLine, icon: <LineIcon /> },
    { label: "Flèche", onClick: addArrow, icon: <ArrowIcon /> },
    { label: "Flèche double", onClick: addDoubleArrow, icon: <DoubleArrowIcon /> },
    { label: "Chevron", onClick: addChevron, icon: <ChevronIcon /> },
  ];

  return (
    <StudioPanel id="studio-panel-lines" title="Lignes">
      <div>
        <StudioSectionLabel>Ajouter</StudioSectionLabel>
        <div className="grid grid-cols-3 gap-2">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={item.onClick}
              disabled={readOnly}
              className="flex flex-col items-center gap-1.5 rounded-md border border-neutral-200 px-2 py-3 text-[11px] font-semibold text-neutral-700 transition hover:border-animeo hover:bg-animeo-soft disabled:cursor-not-allowed disabled:opacity-40"
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      </div>
    </StudioPanel>
  );
}

function LineIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="h-5 w-5"><path d="M4 12h16" /></svg>;
}

function ArrowIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M4 12h14M13 7l5 5-5 5" />
    </svg>
  );
}

function DoubleArrowIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M4 12h16M7 7l-3 5 3 5M17 7l3 5-3 5" />
    </svg>
  );
}

function ChevronIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d="M8 4l8 8-8 8" /></svg>;
}
