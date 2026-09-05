"use client";

import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect } from "react";
import { useDocumentStore } from "@/components/documents/editor/document-store";
import { labelForVariable, resolveVariable } from "@/lib/documents/variables";
import type { DocumentTextElement } from "@/lib/documents/content";

type TextOverlayProps = {
  readOnly: boolean;
};

/**
 * Surcouche DOM par-dessus le Stage Konva (text-overlay.tsx du plan) — le
 * texte n'est jamais rendu par Konva.Text : un simple <div> statique tant
 * que l'élément n'est pas en cours de frappe, remplacé par un éditeur Tiptap
 * uniquement pour l'élément actif (double-clic depuis canvas-stage.tsx).
 * Étape 2 sans zoom/pan : le Stage et cette surcouche partagent exactement
 * les mêmes coordonnées (pas de mise à l'échelle à compenser).
 */
export function TextOverlay({ readOnly }: TextOverlayProps) {
  const content = useDocumentStore((state) => state.content);
  const variableContext = useDocumentStore((state) => state.variableContext);
  const currentPageIndex = useDocumentStore((state) => state.currentPageIndex);
  const editingTextId = useDocumentStore((state) => state.editingTextId);

  const page = content.pages[currentPageIndex];
  if (!page) return null;

  const textElements = page.elements.filter((element): element is DocumentTextElement => element.type === "text");

  return (
    <div className="pointer-events-none absolute inset-0">
      {textElements.map((element) =>
        // Un bloc lié à une variable Animéo n'est jamais éditable en texte
        // libre (sa valeur vient d'une fiche, pas d'une frappe) — voir
        // editor-toolbar.tsx pour l'insertion de ces blocs.
        editingTextId === element.id && !readOnly && !element.variableBinding ? (
          <EditableTextBlock key={element.id} element={element} />
        ) : (
          <StaticTextBlock key={element.id} element={element} variableContext={variableContext} />
        ),
      )}
    </div>
  );
}

function blockStyle(element: DocumentTextElement): React.CSSProperties {
  return {
    position: "absolute",
    left: element.x,
    top: element.y,
    width: element.width,
    height: element.height,
    transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined,
    transformOrigin: "top left",
    padding: 4,
    overflow: "hidden",
  };
}

function StaticTextBlock({ element, variableContext }: { element: DocumentTextElement; variableContext: ReturnType<typeof useDocumentStore.getState>["variableContext"] }) {
  const html = element.variableBinding
    ? `<p>${escapeHtml(resolveVariable(element.variableBinding, variableContext)) || `<span class="text-animeo-muted">${escapeHtml(labelForVariable(element.variableBinding))}</span>`}</p>`
    : element.html || "<p class=\"text-animeo-muted\">Texte…</p>";

  return (
    // pointer-events-none : les clics traversent jusqu'au rectangle fantôme
    // Konva en dessous (sélection/déplacement), voir canvas-stage.tsx.
    <div style={blockStyle(element)} className="pointer-events-none text-sm text-animeo-dark [&_p]:m-0" dangerouslySetInnerHTML={{ __html: html }} />
  );
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function EditableTextBlock({ element }: { element: DocumentTextElement }) {
  const updateElement = useDocumentStore((state) => state.updateElement);
  const setEditingText = useDocumentStore((state) => state.setEditingText);

  const editor = useEditor({
    extensions: [StarterKit],
    content: element.html || "<p></p>",
    immediatelyRender: false,
    onUpdate: ({ editor: instance }) => updateElement(element.id, { html: instance.getHTML() }),
  });

  useEffect(() => {
    if (editor) editor.commands.focus("end");
    // Focus une seule fois à l'entrée en édition — pas à chaque frappe.
  }, [editor]);

  return (
    <div style={{ ...blockStyle(element), pointerEvents: "auto" }} className="rounded outline outline-2 outline-animeo">
      <EditorContent
        editor={editor}
        className="h-full w-full text-sm text-animeo-dark [&_.tiptap]:h-full [&_.tiptap]:outline-none [&_p]:m-0"
        onBlur={() => setEditingText(null)}
      />
    </div>
  );
}
