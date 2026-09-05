"use client";

import { useDocumentStore } from "@/components/documents/editor/document-store";
import type { DocumentElement } from "@/lib/documents/content";

let elementCounter = 0;
function newElementId(prefix: string): string {
  elementCounter += 1;
  return `${prefix}-${Date.now()}-${elementCounter}`;
}

const DEFAULT_POSITION = { x: 60, y: 60 };

/**
 * Bibliothèque d'éléments insérables (étape 2 : texte/formes/image, sans
 * Smart Blocks/schémas/variables — étapes 3-4). "Modèles"/"Blocs Animéo"
 * viendront ici même à l'étape 3, pas dans un fichier séparé.
 */
export function EditorToolbar({ readOnly }: { readOnly: boolean }) {
  const addElement = useDocumentStore((state) => state.addElement);
  const setEditingText = useDocumentStore((state) => state.setEditingText);

  function insert(element: DocumentElement) {
    addElement(element);
    if (element.type === "text") setEditingText(element.id);
  }

  function addText() {
    insert({ id: newElementId("text"), type: "text", ...DEFAULT_POSITION, width: 240, height: 60, rotation: 0, html: "" });
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

  function addImage() {
    const input = window.document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result !== "string") return;
        insert({ id: newElementId("image"), type: "image", ...DEFAULT_POSITION, width: 220, height: 220, rotation: 0, src: reader.result });
      };
      reader.readAsDataURL(file);
    };
    input.click();
  }

  const items: { label: string; onClick: () => void; icon: React.ReactNode }[] = [
    { label: "Texte", onClick: addText, icon: <TextIcon /> },
    { label: "Rectangle", onClick: addRectangle, icon: <RectIcon /> },
    { label: "Cercle", onClick: addCircle, icon: <CircleIcon /> },
    { label: "Ligne", onClick: addLine, icon: <LineIcon /> },
    { label: "Image", onClick: addImage, icon: <ImageIcon /> },
  ];

  return (
    <aside className="w-20 shrink-0 space-y-2 border-r border-[#dce8e5] bg-white p-3 sm:w-24">
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          onClick={item.onClick}
          disabled={readOnly}
          className="flex w-full flex-col items-center gap-1 rounded-xl px-2 py-3 text-[11px] font-extrabold text-animeo-dark transition hover:bg-animeo-soft disabled:cursor-not-allowed disabled:opacity-40"
        >
          {item.icon}
          {item.label}
        </button>
      ))}
    </aside>
  );
}

function TextIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="h-5 w-5"><path d="M5 5h14M12 5v14" /></svg>;
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

function ImageIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="9" cy="9" r="1.5" />
      <path d="m21 15-5-5-11 11" />
    </svg>
  );
}
