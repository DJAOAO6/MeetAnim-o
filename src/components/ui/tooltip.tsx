type TooltipSide = "top" | "bottom" | "left" | "right";
type TooltipAlign = "center" | "start" | "end";

/** À poser sur l'élément qui porte l'infobulle : il la situe et la déclenche. */
export const tooltipHostClassName = "group/tooltip relative";

const sideClassName: Record<TooltipSide, string> = {
  top: "bottom-[calc(100%+0.375rem)]",
  bottom: "top-[calc(100%+0.375rem)]",
  left: "right-[calc(100%+0.5rem)] top-1/2 -translate-y-1/2",
  right: "left-[calc(100%+0.5rem)] top-1/2 -translate-y-1/2",
};

// Au-dessus ou au-dessous : centrée, ou calée sur un bord quand le bouton
// touche celui de l'écran ou d'une fenêtre (une croix de fermeture).
const alignClassName: Record<TooltipAlign, string> = {
  center: "left-1/2 -translate-x-1/2",
  start: "left-0",
  end: "right-0",
};

/**
 * Infobulle d'un bouton à icône seule : son intitulé, visible au survol et
 * au focus clavier.
 *
 * Sans bibliothèque, et sans attribut `title` (double infobulle, délai du
 * système, rien au clavier). Elle se pose **dans** l'élément qui porte
 * `tooltipHostClassName`, lequel doit déjà avoir un nom accessible : l'infobulle
 * le répète pour l'œil, elle est donc masquée aux lecteurs d'écran.
 *
 * Absente du rendu tant qu'elle est masquée (`hidden`, pas une opacité à
 * zéro) : une bulle invisible qui dépasse du bord droit ferait défiler la
 * page de côté. Jamais sur écran tactile, où il n'y a pas de survol et où
 * elle resterait collée après l'appui.
 */
export function TooltipBubble({ label, side = "top", align = "center" }: { label: string; side?: TooltipSide; align?: TooltipAlign }) {
  const horizontal = side === "left" || side === "right";
  return (
    <span
      aria-hidden="true"
      data-tooltip=""
      className={`pointer-events-none absolute z-50 hidden whitespace-nowrap rounded-lg bg-animeo-dark px-2.5 py-1.5 text-xs font-extrabold normal-case tracking-normal text-animeo-surface shadow-lg group-hover/tooltip:block group-focus-visible/tooltip:block [@media(hover:none)]:hidden! ${sideClassName[side]} ${horizontal ? "" : alignClassName[align]}`}
    >
      {label}
    </span>
  );
}
