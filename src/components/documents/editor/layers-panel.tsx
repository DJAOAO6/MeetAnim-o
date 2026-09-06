"use client";

import { useDocumentStore } from "@/components/documents/editor/document-store";
import { labelForVariable } from "@/lib/documents/variables";
import type { DocumentElement } from "@/lib/documents/content";

/**
 * Libellé dérivé du contenu réel de l'élément — jamais un nom inventé, voir
 * le plan ("labelForVariable pour un texte lié, aperçu texte tronqué
 * sinon...").
 */
function elementLabel(element: DocumentElement): string {
  if (element.type === "text") {
    if (element.variableBinding) return labelForVariable(element.variableBinding);
    const stripped = element.html.replace(/<[^>]+>/g, "").trim();
    if (!stripped) return "Texte";
    return stripped.length > 30 ? `${stripped.slice(0, 30)}…` : stripped;
  }
  if (element.type === "image") return "Image";
  if (element.type === "diagram") return "Schéma (chien)";
  if (element.shape === "circle") return "Cercle";
  if (element.shape === "line") return "Ligne";
  return "Rectangle";
}

/**
 * Panneau Calques (étape 11) — liste à plat en ordre INVERSE du tableau
 * `elements` : le dernier élément du tableau est le premier plan (dernier
 * dessiné par Konva), donc affiché en tête ici, convention Figma/Illustrator.
 * Pas de glisser-déposer ni de groupement (hors périmètre), seulement
 * afficher/masquer et monter/descendre d'un cran.
 */
export function LayersPanel({ readOnly }: { readOnly: boolean }) {
  const content = useDocumentStore((state) => state.content);
  const currentPageIndex = useDocumentStore((state) => state.currentPageIndex);
  const selectedElementId = useDocumentStore((state) => state.selectedElementId);
  const selectElement = useDocumentStore((state) => state.selectElement);
  const setElementHidden = useDocumentStore((state) => state.setElementHidden);
  const moveElementUp = useDocumentStore((state) => state.moveElementUp);
  const moveElementDown = useDocumentStore((state) => state.moveElementDown);

  const elements = content.pages[currentPageIndex]?.elements ?? [];
  const rows = elements.map((element, index) => ({ element, index })).reverse();

  if (rows.length === 0) {
    return <p className="p-4 text-sm text-neutral-500">Aucun élément sur cette page.</p>;
  }

  return (
    <ul className="divide-y divide-neutral-100 p-2">
      {rows.map(({ element, index }) => {
        const label = elementLabel(element);
        const hidden = Boolean(element.hidden);
        const isSelected = element.id === selectedElementId;
        return (
          <li key={element.id}>
            <div className={`flex items-center gap-1 rounded-md px-2 py-1.5 ${isSelected ? "bg-animeo-soft" : "hover:bg-neutral-50"}`}>
              <button
                type="button"
                onClick={() => selectElement(element.id)}
                className={`min-w-0 flex-1 truncate text-left text-sm font-medium ${isSelected ? "text-animeo-dark" : hidden ? "text-neutral-400" : "text-neutral-700"}`}
              >
                {label}
              </button>
              <button
                type="button"
                aria-pressed={hidden}
                aria-label={hidden ? `Afficher ${label}` : `Masquer ${label}`}
                onClick={() => setElementHidden(element.id, !hidden)}
                disabled={readOnly}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-neutral-500 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {hidden ? <EyeOffIcon /> : <EyeIcon />}
              </button>
              <button
                type="button"
                aria-label={`Monter ${label} dans l'ordre d'affichage`}
                onClick={() => moveElementUp(element.id)}
                disabled={readOnly || index === elements.length - 1}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-neutral-500 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-30"
              >
                <ChevronIcon direction="up" />
              </button>
              <button
                type="button"
                aria-label={`Descendre ${label} dans l'ordre d'affichage`}
                onClick={() => moveElementDown(element.id)}
                disabled={readOnly || index === 0}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-neutral-500 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-30"
              >
                <ChevronIcon direction="down" />
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function EyeIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
      <path d="M3 3l18 18M10.6 10.6a3 3 0 0 0 4.24 4.24M9.9 4.24A10.4 10.4 0 0 1 12 4c6.5 0 10 7 10 7a13.2 13.2 0 0 1-3.15 3.9M6.1 6.1C3.6 7.9 2 11 2 12s3.5 7 10 7c1.1 0 2.14-.15 3.1-.42" />
    </svg>
  );
}

function ChevronIcon({ direction }: { direction: "up" | "down" }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
      <path d={direction === "up" ? "M6 15l6-6 6 6" : "M6 9l6 6 6-6"} />
    </svg>
  );
}
