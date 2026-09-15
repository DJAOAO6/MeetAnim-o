"use client";

import { useDocumentStore } from "@/components/documents/editor/document-store";

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
            <span className="flex items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
              <button
                type="button"
                aria-label={`Dupliquer la page ${index + 1}`}
                onClick={() => duplicatePage(index)}
                className="flex h-5 w-5 items-center justify-center rounded text-neutral-500 hover:bg-neutral-100"
              >
                <CopyIcon />
              </button>
              {pages.length > 1 ? (
                <button
                  type="button"
                  aria-label={`Supprimer la page ${index + 1}`}
                  onClick={() => removePage(index)}
                  className="flex h-5 w-5 items-center justify-center rounded text-animeo-error hover:bg-animeo-danger-soft"
                >
                  <TrashIcon />
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
          + Ajouter une page
        </button>
      ) : null}
    </div>
  );
}

function CopyIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
      <rect x="9" y="9" width="12" height="12" rx="1.5" />
      <path d="M5 15V4.5A1.5 1.5 0 0 1 6.5 3H15" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
      <path d="M4 7h16M9 7V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V7M6 7l1 13.5A1.5 1.5 0 0 0 8.5 22h7a1.5 1.5 0 0 0 1.5-1.5L18 7" />
    </svg>
  );
}
