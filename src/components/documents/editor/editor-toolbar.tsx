"use client";

import { useDocumentStore } from "@/components/documents/editor/document-store";
import { documentVariables, type DocumentVariableDefinition } from "@/lib/documents/variables";
import type { DocumentElement, DocumentTextElement } from "@/lib/documents/content";

let elementCounter = 0;
function newElementId(prefix: string): string {
  elementCounter += 1;
  return `${prefix}-${Date.now()}-${elementCounter}`;
}

const DEFAULT_POSITION = { x: 60, y: 60 };

function variableTextElement(token: string, x: number, y: number, width = 220, height = 28): DocumentTextElement {
  return { id: newElementId("text"), type: "text", x, y, width, height, rotation: 0, html: "", variableBinding: token };
}

/**
 * Bibliothèque d'éléments insérables : formes de base (étape 2), Smart
 * Blocks et variables Animéo (étape 3). Les Smart Blocks sont de simples
 * groupes d'éléments pré-positionnés insérés en un clic — pas d'abstraction
 * séparée, comme prévu au plan.
 */
export function EditorToolbar({ readOnly }: { readOnly: boolean }) {
  const addElement = useDocumentStore((state) => state.addElement);
  const addElements = useDocumentStore((state) => state.addElements);
  const setEditingText = useDocumentStore((state) => state.setEditingText);

  function insert(element: DocumentElement) {
    addElement(element);
    if (element.type === "text" && !element.variableBinding) setEditingText(element.id);
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

  function insertVariable(token: string) {
    insert(variableTextElement(token, DEFAULT_POSITION.x, DEFAULT_POSITION.y));
  }

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
    insert({
      id: newElementId("text"),
      type: "text",
      ...DEFAULT_POSITION,
      width: 320,
      height: 100,
      rotation: 0,
      html: "<p><strong>Recommandations</strong></p><p></p>",
    });
  }

  const elementItems: { label: string; onClick: () => void; icon: React.ReactNode }[] = [
    { label: "Texte", onClick: addText, icon: <TextIcon /> },
    { label: "Rectangle", onClick: addRectangle, icon: <RectIcon /> },
    { label: "Cercle", onClick: addCircle, icon: <CircleIcon /> },
    { label: "Ligne", onClick: addLine, icon: <LineIcon /> },
    { label: "Image", onClick: addImage, icon: <ImageIcon /> },
  ];

  const smartBlocks: { label: string; onClick: () => void }[] = [
    { label: "Carte animal", onClick: addAnimalCard },
    { label: "Infos propriétaire", onClick: addOwnerCard },
    { label: "Recommandations", onClick: addRecommendationsBlock },
  ];

  const variableGroups = groupVariables(documentVariables);

  return (
    <aside className="w-64 shrink-0 space-y-6 overflow-y-auto border-r border-[#dce8e5] bg-white p-4">
      <section>
        <p className="mb-2 text-xs font-extrabold uppercase tracking-[0.08em] text-animeo-muted">Éléments</p>
        <div className="grid grid-cols-3 gap-2">
          {elementItems.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={item.onClick}
              disabled={readOnly}
              className="flex flex-col items-center gap-1 rounded-xl px-2 py-3 text-[11px] font-extrabold text-animeo-dark transition hover:bg-animeo-soft disabled:cursor-not-allowed disabled:opacity-40"
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      </section>

      <section>
        <p className="mb-2 text-xs font-extrabold uppercase tracking-[0.08em] text-animeo-muted">Blocs Animéo</p>
        <div className="space-y-1.5">
          {smartBlocks.map((block) => (
            <button
              key={block.label}
              type="button"
              onClick={block.onClick}
              disabled={readOnly}
              className="w-full rounded-xl border border-[#d9e5e2] px-3 py-2 text-left text-xs font-extrabold text-animeo-dark transition hover:border-animeo hover:bg-animeo-soft disabled:cursor-not-allowed disabled:opacity-40"
            >
              {block.label}
            </button>
          ))}
        </div>
      </section>

      <section>
        <p className="mb-2 text-xs font-extrabold uppercase tracking-[0.08em] text-animeo-muted">Données Animéo</p>
        <div className="space-y-3">
          {variableGroups.map(([group, variables]) => (
            <div key={group}>
              <p className="mb-1 text-[10px] font-bold text-animeo-muted">{group}</p>
              <div className="flex flex-wrap gap-1.5">
                {variables.map((variable) => (
                  <button
                    key={variable.token}
                    type="button"
                    onClick={() => insertVariable(variable.token)}
                    disabled={readOnly}
                    title={`Insérer ${variable.label}`}
                    className="rounded-lg bg-animeo-bg px-2.5 py-1.5 text-[11px] font-bold text-animeo-dark transition hover:bg-animeo-soft disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {variable.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </aside>
  );
}

function groupVariables(variables: DocumentVariableDefinition[]): [string, DocumentVariableDefinition[]][] {
  const groups = new Map<string, DocumentVariableDefinition[]>();
  for (const variable of variables) {
    const list = groups.get(variable.group) ?? [];
    list.push(variable);
    groups.set(variable.group, list);
  }
  return Array.from(groups.entries());
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
