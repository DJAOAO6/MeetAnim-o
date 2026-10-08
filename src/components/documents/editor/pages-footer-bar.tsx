"use client";

import { useDocumentStore } from "@/components/documents/editor/document-store";
import { Copy, Plus, Trash2 } from "lucide-react";

/**
 * Barre de pages en pied de canevas (étape 10) — remplace l'onglet "Pages"
 * initialement envisagé dans l'inspecteur droit (redondant avec cette
 * barre, voir le plan). Chaque onglet affiche le numéro de page et son
 * nombre d'éléments réel (donnée vivante, pas une miniature rendue en
 * direct — recalculer un croquis à chaque frappe pour un gain visuel
 * marginal ne le justifie pas, contrairement au croquis statique des
 * modèles à l'étape 7).
 */
export function PagesFooterBar({ readOnly }: { readOnly: boolean }) {
  const pages = useDocumentStore((state) => state.content.pages);
  const currentPageIndex = useDocumentStore((state) => state.currentPageIndex);
  const setCurrentPageIndex = useDocumentStore((state) => state.setCurrentPageIndex);
  const addPage = useDocumentStore((state) => state.addPage);
  const duplicatePage = useDocumentStore((state) => state.duplicatePage);
  const removePage = useDocumentStore((state) => state.removePage);

  return (
    <div className="flex shrink-0 items-center gap-2 overflow-x-auto border-t border-neutral-200 bg-white px-4 py-2">
      {pages.map((page, index) => (
        <div
          key={page.id}
          className={`group flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-semibold transition ${
            index === currentPageIndex ? "border-animeo bg-animeo-soft text-animeo-dark" : "border-neutral-200 text-neutral-600 hover:border-neutral-300"
          }`}
        >
          <button type="button" onClick={() => setCurrentPageIndex(index)} className="flex items-center gap-1.5">
            <span>Page {index + 1}</span>
            <span className="text-neutral-400">· {page.elements.length} élément{page.elements.length > 1 ? "s" : ""}</span>
          </button>
          {!readOnly ? (
            <span className="flex items-center gap-0.5 opacity-0 transition group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:gap-1 [@media(hover:none)]:opacity-100">
              <button
                type="button"
                aria-label={`Dupliquer la page ${index + 1}`}
                onClick={() => duplicatePage(index)}
                className="flex h-5 w-5 items-center justify-center rounded text-neutral-500 hover:bg-neutral-100 [@media(hover:none)]:h-9 [@media(hover:none)]:w-9"
              >
                <Copy aria-hidden="true" className="h-3 w-3 [@media(hover:none)]:h-4 [@media(hover:none)]:w-4" />
              </button>
              {pages.length > 1 ? (
                <button
                  type="button"
                  aria-label={`Supprimer la page ${index + 1}`}
                  onClick={() => removePage(index)}
                  className="flex h-5 w-5 items-center justify-center rounded text-animeo-danger hover:bg-animeo-danger-soft [@media(hover:none)]:h-9 [@media(hover:none)]:w-9"
                >
                  <Trash2 aria-hidden="true" className="h-3 w-3 [@media(hover:none)]:h-4 [@media(hover:none)]:w-4" />
                </button>
              ) : null}
            </span>
          ) : null}
        </div>
      ))}

      {!readOnly ? (
        <button
          type="button"
          onClick={addPage}
          className="flex shrink-0 items-center gap-1 rounded-md border border-dashed border-neutral-300 px-2.5 py-1.5 text-xs font-semibold text-neutral-600 transition hover:border-animeo hover:text-animeo-dark"
        >
          <Plus aria-hidden="true" className="h-3.5 w-3.5" />
          Ajouter une page
        </button>
      ) : null}
    </div>
  );
}
