"use client";

import { useDocumentStore, useSelectedElementId } from "@/components/documents/editor/document-store";

const BADGE_SIZE = 24;

/**
 * Cadenas flottant (étape 25) — accès rapide au verrouillage directement
 * depuis le canevas, sans changer d'onglet pour Calques, pendant qu'on
 * travaille sur un élément. Volontairement PAS une barre d'actions complète
 * (dupliquer/supprimer déjà accessibles via clavier et Propriétés) — juste
 * le cadenas, pour rester dans le périmètre exact demandé ("il n'y a pas de
 * système de verrouillage"). N'apparaît que pour une sélection UNIQUE (voir
 * useSelectedElementId) — verrouiller plusieurs éléments à la fois reste
 * possible élément par élément depuis Calques, cas d'usage secondaire.
 * Ancré au-dessus du coin haut-droit de la boîte englobante (jamais
 * exactement SUR le coin : un premier jet centré pile sur le coin
 * recouvrait la poignée de redimensionnement du Transformer pour tout
 * élément fin comme une ligne, empêchant physiquement de cliquer la
 * poignée — bug découvert via un test E2E qui échouait uniquement dans
 * cette configuration précise). Mêmes coordonnées page non mises à
 * l'échelle que alignment-toolbar.tsx (hérite du zoom automatiquement,
 * même marge de 6px au-dessus de la boîte que ce composant) — rotation
 * ignorée pour ce positionnement, même simplification déjà assumée pour
 * la boîte englobante de sélection multiple (étape 13).
 */
export function SelectionLockBadge({ readOnly }: { readOnly: boolean }) {
  const content = useDocumentStore((state) => state.content);
  const currentPageIndex = useDocumentStore((state) => state.currentPageIndex);
  const selectedElementId = useSelectedElementId();
  const setElementLocked = useDocumentStore((state) => state.setElementLocked);

  const page = content.pages[currentPageIndex];
  const element = page?.elements.find((item) => item.id === selectedElementId);

  if (readOnly || !element || element.hidden) return null;

  const locked = Boolean(element.locked);

  return (
    <button
      type="button"
      aria-pressed={locked}
      aria-label={locked ? "Déverrouiller l'élément" : "Verrouiller l'élément"}
      title={locked ? "Déverrouiller l'élément" : "Verrouiller l'élément"}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => setElementLocked(element.id, !locked)}
      style={{
        position: "absolute",
        left: element.x + element.width - BADGE_SIZE,
        top: Math.max(0, element.y - BADGE_SIZE - 6),
        width: BADGE_SIZE,
        height: BADGE_SIZE,
        pointerEvents: "auto",
      }}
      className={`flex items-center justify-center rounded-full border shadow-sm transition ${
        locked ? "border-animeo bg-animeo text-white" : "border-neutral-200 bg-white text-neutral-500 hover:bg-neutral-50"
      }`}
    >
      {locked ? <LockIcon /> : <UnlockIcon />}
    </button>
  );
}

function LockIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
      <path d="M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Z M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function UnlockIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
      <path d="M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Z M7 11V7a5 5 0 0 1 9.9-1" />
    </svg>
  );
}
