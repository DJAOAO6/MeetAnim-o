"use client";

import { useDocumentStore } from "@/components/documents/editor/document-store";
import { StudioPanel, StudioSectionLabel } from "@/components/documents/editor/studio-chrome";
import { newElementId, variableTextElement } from "@/components/documents/editor/element-factory";

export function SmartBlocksPanel({ readOnly }: { readOnly: boolean }) {
  const addElements = useDocumentStore((state) => state.addElements);
  const addElement = useDocumentStore((state) => state.addElement);

  function addAnimalCard() {
    const x = 60;
    const y = 60;
    addElements([
      { id: newElementId("shape"), type: "shape", shape: "rect", x, y, width: 260, height: 150, rotation: 0, fill: "#f7faf9", stroke: "#dce8e5" },
      variableTextElement("animal.name", x + 12, y + 10, 236, 26),
      variableTextElement("animal.species", x + 12, y + 40, 236, 22),
      variableTextElement("animal.breed", x + 12, y + 64, 236, 22),
      variableTextElement("animal.sex", x + 12, y + 92, 112, 22),
      variableTextElement("animal.weight", x + 136, y + 92, 112, 22),
    ]);
  }

  function addOwnerCard() {
    const x = 60;
    const y = 60;
    addElements([
      { id: newElementId("shape"), type: "shape", shape: "rect", x, y, width: 260, height: 150, rotation: 0, fill: "#f7faf9", stroke: "#dce8e5" },
      variableTextElement("client.firstName", x + 12, y + 10, 112, 24),
      variableTextElement("client.lastName", x + 136, y + 10, 112, 24),
      variableTextElement("client.phone", x + 12, y + 42, 236, 22),
      variableTextElement("client.email", x + 12, y + 66, 236, 22),
      variableTextElement("client.address", x + 12, y + 90, 236, 44),
    ]);
  }

  function addRecommendationsBlock() {
    addElement({
      id: newElementId("text"),
      type: "text",
      x: 60,
      y: 60,
      width: 320,
      height: 100,
      rotation: 0,
      html: "<p><strong>Recommandations</strong></p><p></p>",
    });
  }

  const smartBlocks = [
    { label: "Carte animal", onClick: addAnimalCard },
    { label: "Infos propriétaire", onClick: addOwnerCard },
    { label: "Recommandations", onClick: addRecommendationsBlock },
  ];

  return (
    <StudioPanel id="studio-panel-blocks" title="Blocs Animéo">
      <div>
        <StudioSectionLabel>Insérer</StudioSectionLabel>
        <div className="space-y-1.5">
          {smartBlocks.map((block) => (
            <button
              key={block.label}
              type="button"
              onClick={block.onClick}
              disabled={readOnly}
              className="w-full rounded-md border border-neutral-200 px-3 py-2 text-left text-sm font-semibold text-neutral-700 transition hover:border-animeo hover:bg-animeo-soft disabled:cursor-not-allowed disabled:opacity-40"
            >
              {block.label}
            </button>
          ))}
        </div>
      </div>
    </StudioPanel>
  );
}
