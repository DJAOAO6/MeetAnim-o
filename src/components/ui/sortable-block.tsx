"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ReactNode } from "react";

type SortableBlockProps = {
  id: string;
  /** Hors mode édition, le bloc est rendu tel quel : aucun capteur, aucun surcoût. */
  editing: boolean;
  /** Barre d'outils du bloc en mode édition (largeur, masquer…). */
  toolbar?: ReactNode;
  label: string;
  className?: string;
  children: ReactNode;
};

/**
 * Bloc réordonnable à la souris, au doigt et au clavier — brique commune au
 * tableau de bord et, à terme, à l'éditeur de page de réservation.
 *
 * Le déplacement ne part que de la poignée, jamais du corps du bloc : les
 * widgets contiennent des boutons et des listes défilantes, et un
 * glisser-déposer déclenché n'importe où rendrait ces contenus inutilisables
 * au doigt. Le même principe que l'agenda : le geste de déplacement doit être
 * explicite.
 */
export function SortableBlock({ id, editing, toolbar, label, className = "", children }: SortableBlockProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled: !editing });

  if (!editing) return <div className={className} data-testid={`block-${id}`}>{children}</div>;

  return (
    <div
      ref={setNodeRef}
      data-testid={`block-${id}`}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`rounded-[22px] p-2 outline-2 outline-dashed outline-offset-2 outline-animeo-border-strong ${isDragging ? "z-30 opacity-80" : ""} ${className}`}
    >
      {/* Barre d'outils dans le flux, pas en superposition : sur téléphone
          elle passe sur deux lignes et recouvrait le haut du bloc — titre et
          premières commandes devenaient illisibles. */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Déplacer le bloc ${label}`}
          className="flex min-h-9 cursor-grab items-center gap-2 rounded-xl bg-animeo px-3 text-xs font-extrabold text-white shadow-sm active:cursor-grabbing"
        >
          <span aria-hidden="true">⠿</span>
          <span className="max-w-[9rem] truncate">{label}</span>
        </button>
        {toolbar}
      </div>
      {/* Le contenu reste visible mais inerte : on personnalise la disposition,
          on n'utilise pas les blocs. Évite qu'un glissement finisse par
          déclencher le bouton qui se trouvait sous le doigt. */}
      <div className="pointer-events-none">{children}</div>
    </div>
  );
}
