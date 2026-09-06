"use client";

import { useDocumentStore } from "@/components/documents/editor/document-store";
import { StudioPanel, StudioSectionLabel } from "@/components/documents/editor/studio-chrome";
import { DEFAULT_POSITION, newElementId } from "@/components/documents/editor/element-factory";
import type { DocumentShapeElement } from "@/lib/documents/content";

export function ShapesPanel({ readOnly }: { readOnly: boolean }) {
  const addElement = useDocumentStore((state) => state.addElement);

  function insert(element: DocumentShapeElement) {
    addElement(element);
  }

  function addRectangle() {
    insert({ id: newElementId("shape"), type: "shape", shape: "rect", ...DEFAULT_POSITION, width: 160, height: 100, rotation: 0, fill: "#e4f5ef", stroke: "#4FAF9F" });
  }

  function addCircle() {
    insert({ id: newElementId("shape"), type: "shape", shape: "circle", ...DEFAULT_POSITION, width: 120, height: 120, rotation: 0, fill: "#fff1d5", stroke: "#e0a83f" });
  }

  function addLine() {
    insert({ id: newElementId("shape"), type: "shape", shape: "line", ...DEFAULT_POSITION, width: 200, height: 2, rotation: 0, fill: "#183b45", stroke: "#183b45" });
  }

  const items = [
    { label: "Rectangle", onClick: addRectangle, icon: <RectIcon /> },
    { label: "Cercle", onClick: addCircle, icon: <CircleIcon /> },
    { label: "Ligne", onClick: addLine, icon: <LineIcon /> },
  ];

  return (
    <StudioPanel id="studio-panel-shapes" title="Formes">
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

function RectIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5"><rect x="4" y="6" width="16" height="12" rx="2" /></svg>;
}

function CircleIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5"><circle cx="12" cy="12" r="8" /></svg>;
}

function LineIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="h-5 w-5"><path d="M4 12h16" /></svg>;
}
