"use client";

import { useDocumentStore } from "@/components/documents/editor/document-store";
import { StudioPanel, StudioSectionLabel } from "@/components/documents/editor/studio-chrome";
import { DEFAULT_POSITION, newElementId } from "@/components/documents/editor/element-factory";

export function ImagesPanel({ readOnly }: { readOnly: boolean }) {
  const addElement = useDocumentStore((state) => state.addElement);

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
        addElement({ id: newElementId("image"), type: "image", ...DEFAULT_POSITION, width: 220, height: 220, rotation: 0, src: reader.result });
      };
      reader.readAsDataURL(file);
    };
    input.click();
  }

  return (
    <StudioPanel id="studio-panel-images" title="Images">
      <div>
        <StudioSectionLabel>Ajouter</StudioSectionLabel>
        <button
          type="button"
          onClick={addImage}
          disabled={readOnly}
          className="flex w-full items-center gap-2 rounded-md border border-neutral-200 px-3 py-2.5 text-left text-sm font-semibold text-neutral-700 transition hover:border-animeo hover:bg-animeo-soft disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ImageIcon />
          Importer une image
        </button>
      </div>
    </StudioPanel>
  );
}

function ImageIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="9" cy="9" r="1.5" />
      <path d="m21 15-5-5-11 11" />
    </svg>
  );
}
