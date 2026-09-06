"use client";

import { useDocumentStore } from "@/components/documents/editor/document-store";
import { StudioPanel, StudioSectionLabel } from "@/components/documents/editor/studio-chrome";
import { DEFAULT_POSITION, newElementId } from "@/components/documents/editor/element-factory";

export function TextPanel({ readOnly }: { readOnly: boolean }) {
  const addElement = useDocumentStore((state) => state.addElement);
  const setEditingText = useDocumentStore((state) => state.setEditingText);

  function addText() {
    const element = { id: newElementId("text"), type: "text" as const, ...DEFAULT_POSITION, width: 240, height: 60, rotation: 0, html: "" };
    addElement(element);
    setEditingText(element.id);
  }

  return (
    <StudioPanel id="studio-panel-text" title="Texte">
      <div>
        <StudioSectionLabel>Ajouter</StudioSectionLabel>
        <button
          type="button"
          onClick={addText}
          disabled={readOnly}
          className="flex w-full items-center gap-2 rounded-md border border-neutral-200 px-3 py-2.5 text-left text-sm font-semibold text-neutral-700 transition hover:border-animeo hover:bg-animeo-soft disabled:cursor-not-allowed disabled:opacity-40"
        >
          <TextIcon />
          Bloc de texte
        </button>
      </div>
    </StudioPanel>
  );
}

function TextIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="h-4 w-4 shrink-0"><path d="M5 5h14M12 5v14" /></svg>;
}
