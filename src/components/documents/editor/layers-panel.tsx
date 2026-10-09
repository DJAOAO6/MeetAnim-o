"use client";

import { useDocumentStore } from "@/components/documents/editor/document-store";
import { labelForVariable } from "@/lib/documents/variables";
import { studioIconByName } from "@/components/documents/editor/studio-icons";
import { getAnatomyView } from "@/lib/anatomy/views";
import type { DocumentElement, DocumentShapeElement } from "@/lib/documents/content";
import { ChevronDown, ChevronUp, Eye, EyeOff, Lock, LockOpen } from "lucide-react";

const SHAPE_LABELS: Record<DocumentShapeElement["shape"], string> = {
  rect: "Rectangle",
  circle: "Cercle",
  line: "Ligne",
  ellipse: "Ellipse",
  triangle: "Triangle",
  hexagon: "Hexagone",
  diamond: "Losange",
  star: "Étoile",
  arrow: "Flèche",
  chevron: "Chevron",
};

/**
 * Libellé dérivé du contenu réel de l'élément — jamais un nom inventé, voir
 * le plan ("labelForVariable pour un texte lié, aperçu texte tronqué
 * sinon..."). `SHAPE_LABELS` couvre les 10 types de forme (étapes 19-20) —
 * avant, seuls circle/line étaient distingués, tout le reste (ellipse,
 * triangle, hexagone, losange, étoile, flèche, chevron) s'affichait
 * silencieusement comme "Rectangle", un vrai bug corrigé ici (étape 23).
 */
function elementLabel(element: DocumentElement): string {
  if (element.type === "text") {
    if (element.variableBinding) return labelForVariable(element.variableBinding);
    const stripped = element.html.replace(/<[^>]+>/g, "").trim();
    if (!stripped) return "Texte";
    return stripped.length > 30 ? `${stripped.slice(0, 30)}…` : stripped;
  }
  if (element.type === "image") return "Image";
  if (element.type === "diagram") return "Schéma (ancien)";
  if (element.type === "anatomy") return getAnatomyView(element.viewId)?.label ?? "Schéma anatomique";
  if (element.type === "icon") return studioIconByName(element.iconName)?.name ?? "Icône";
  return SHAPE_LABELS[element.shape];
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
  const selectedElementIds = useDocumentStore((state) => state.selectedElementIds);
  const selectElement = useDocumentStore((state) => state.selectElement);
  const setElementHidden = useDocumentStore((state) => state.setElementHidden);
  const setElementLocked = useDocumentStore((state) => state.setElementLocked);
  const moveElementUp = useDocumentStore((state) => state.moveElementUp);
  const moveElementDown = useDocumentStore((state) => state.moveElementDown);

  const elements = content.pages[currentPageIndex]?.elements ?? [];
  const rows = elements.map((element, index) => ({ element, index })).reverse();

  if (rows.length === 0) {
    return <p className="p-4 text-sm text-neutral-500">Aucun élément sur cette page.</p>;
  }

  // Deux éléments du même type ("Rectangle", "Texte"...) ont le même
  // libellé de base sur un document riche — on ne les distingue que quand
  // ça arrive réellement, pour ne jamais changer un libellé déjà unique.
  const baseLabels = rows.map(({ element }) => elementLabel(element));
  const labelCounts = new Map<string, number>();
  for (const label of baseLabels) labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1);
  const seenCounts = new Map<string, number>();

  return (
    <ul className="divide-y divide-neutral-100 p-2">
      {rows.map(({ element, index }, rowIndex) => {
        const baseLabel = baseLabels[rowIndex];
        let label = baseLabel;
        if ((labelCounts.get(baseLabel) ?? 0) > 1) {
          const seen = (seenCounts.get(baseLabel) ?? 0) + 1;
          seenCounts.set(baseLabel, seen);
          label = `${baseLabel} (${seen})`;
        }
        const hidden = Boolean(element.hidden);
        const locked = Boolean(element.locked);
        const isSelected = selectedElementIds.includes(element.id);
        return (
          <li key={element.id}>
            <div className={`flex items-center gap-1 rounded-md px-2 py-1.5 ${isSelected ? "bg-animeo-soft" : "hover:bg-neutral-50"}`}>
              <button
                type="button"
                onClick={(event) => selectElement(element.id, { additive: event.shiftKey })}
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
                {hidden ? <EyeOff aria-hidden="true" className="h-3.5 w-3.5" /> : <Eye aria-hidden="true" className="h-3.5 w-3.5" />}
              </button>
              <button
                type="button"
                aria-pressed={locked}
                aria-label={locked ? `Déverrouiller ${label}` : `Verrouiller ${label}`}
                onClick={() => setElementLocked(element.id, !locked)}
                disabled={readOnly}
                // Cadenas fermé et ouvert ne se distinguent que par la
                // position de l'anse, illisible à 14px dans une liste de
                // plusieurs calques : la couleur porte l'état, comme le badge
                // du canevas (selection-lock-badge.tsx).
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-40 ${
                  locked ? "text-animeo" : "text-neutral-500"
                }`}
              >
                {locked ? <Lock aria-hidden="true" className="h-3.5 w-3.5" /> : <LockOpen aria-hidden="true" className="h-3.5 w-3.5" />}
              </button>
              <button
                type="button"
                aria-label={`Monter ${label} dans l'ordre d'affichage`}
                onClick={() => moveElementUp(element.id)}
                disabled={readOnly || index === elements.length - 1}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-neutral-500 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-30"
              >
                <ChevronUp aria-hidden="true" className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                aria-label={`Descendre ${label} dans l'ordre d'affichage`}
                onClick={() => moveElementDown(element.id)}
                disabled={readOnly || index === 0}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-neutral-500 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-30"
              >
                <ChevronDown aria-hidden="true" className="h-3.5 w-3.5" />
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

