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

  // Préréglages du rectangle existant (étape 19) — pas de nouveau type de
  // forme, juste un cornerRadius différent (déjà un champ existant).
  function addRoundedRectangle() {
    insert({ id: newElementId("shape"), type: "shape", shape: "rect", ...DEFAULT_POSITION, width: 160, height: 100, rotation: 0, fill: "#e4f5ef", stroke: "#4FAF9F", cornerRadius: 20 });
  }

  function addBadge() {
    insert({ id: newElementId("shape"), type: "shape", shape: "rect", ...DEFAULT_POSITION, width: 140, height: 44, rotation: 0, fill: "#fff1d5", stroke: "#e0a83f", cornerRadius: 22 });
  }

  function addEllipse() {
    insert({ id: newElementId("shape"), type: "shape", shape: "ellipse", ...DEFAULT_POSITION, width: 160, height: 100, rotation: 0, fill: "#f1ecf9", stroke: "#7a5aa8" });
  }

  function addTriangle() {
    insert({ id: newElementId("shape"), type: "shape", shape: "triangle", ...DEFAULT_POSITION, width: 120, height: 120, rotation: 0, fill: "#e4f5ef", stroke: "#4FAF9F" });
  }

  function addHexagon() {
    insert({ id: newElementId("shape"), type: "shape", shape: "hexagon", ...DEFAULT_POSITION, width: 120, height: 120, rotation: 0, fill: "#e8eff6", stroke: "#3a5f8a" });
  }

  function addDiamond() {
    insert({ id: newElementId("shape"), type: "shape", shape: "diamond", ...DEFAULT_POSITION, width: 120, height: 120, rotation: 0, fill: "#fbeee0", stroke: "#b9762e" });
  }

  function addStar() {
    insert({ id: newElementId("shape"), type: "shape", shape: "star", ...DEFAULT_POSITION, width: 120, height: 120, rotation: 0, fill: "#fff1d5", stroke: "#e0a83f" });
  }

  const items = [
    { label: "Rectangle", onClick: addRectangle, icon: <RectIcon /> },
    { label: "Cercle", onClick: addCircle, icon: <CircleIcon /> },
    { label: "Rectangle arrondi", onClick: addRoundedRectangle, icon: <RoundedRectIcon /> },
    { label: "Badge", onClick: addBadge, icon: <BadgeIcon /> },
    { label: "Ellipse", onClick: addEllipse, icon: <EllipseIcon /> },
    { label: "Triangle", onClick: addTriangle, icon: <TriangleIcon /> },
    { label: "Hexagone", onClick: addHexagon, icon: <HexagonIcon /> },
    { label: "Losange", onClick: addDiamond, icon: <DiamondIcon /> },
    { label: "Étoile", onClick: addStar, icon: <StarIcon /> },
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

function RoundedRectIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5"><rect x="4" y="6" width="16" height="12" rx="6" /></svg>;
}

function BadgeIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5"><rect x="3" y="8" width="18" height="8" rx="4" /></svg>;
}

function EllipseIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5"><ellipse cx="12" cy="12" rx="9" ry="6" /></svg>;
}

function TriangleIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" className="h-5 w-5"><path d="M12 4l8 16H4z" /></svg>;
}

function HexagonIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" className="h-5 w-5"><path d="M8 3.5h8l4 8.5-4 8.5H8l-4-8.5z" /></svg>;
}

function DiamondIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" className="h-5 w-5"><path d="M12 3l9 9-9 9-9-9z" /></svg>;
}

function StarIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" className="h-5 w-5">
      <path d="M12 3.5l2.47 5.13 5.53.68-4.05 3.88 1.06 5.51L12 15.9l-4.99 2.8 1.06-5.51-4.05-3.88 5.53-.68z" />
    </svg>
  );
}
