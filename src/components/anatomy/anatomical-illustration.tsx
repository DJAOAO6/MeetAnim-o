import type { AnatomyShape, AnatomyView } from "@/lib/anatomy/views";

/**
 * Couche 1/3 : l'ILLUSTRATION. Volontairement passive — aucune interaction,
 * aucun état. C'est l'emplacement où vient se brancher l'asset anatomique
 * définitif (SVG vectoriel, fond transparent, traits fins), sans que la
 * couche interactive ni le référentiel n'aient à changer.
 *
 * Tant qu'aucun asset n'est fourni (`view.awaitingIllustration`), on affiche
 * la carte des zones en repères très pâles : ce n'est PAS un dessin d'animal
 * et ça ne prétend pas en être un — c'est la carte interactive rendue
 * visible, accompagnée d'une mention explicite côté AnatomyViewer.
 */
export function AnatomicalIllustration({ view }: { view: AnatomyView }) {
  if (!view.awaitingIllustration) {
    // Emplacement de l'asset réel : <use href="..."/> ou le SVG inline de
    // l'illustration livrée, aligné sur le même viewBox que les hitboxes.
    return null;
  }

  return (
    <g aria-hidden="true" data-placeholder="illustration">
      {view.hitboxes.map((hitbox) => (
        <ShapeOutline key={hitbox.zoneId} shape={hitbox.shape} />
      ))}
    </g>
  );
}

// Peinture en ATTRIBUTS, pas en classes Tailwind : l'export PDF capture la
// surcouche DOM via html-to-image, qui ne rejoue pas ces classes — les
// formes repartaient alors sur le `fill` noir par défaut du SVG et le
// schéma sortait en pavés noirs dans le PDF (constaté sur un export réel).
const OUTLINE_FILL = "#f5f5f5";
const OUTLINE_STROKE = "#d4d4d4";

function ShapeOutline({ shape }: { shape: AnatomyShape }) {
  const paint = { fill: OUTLINE_FILL, stroke: OUTLINE_STROKE, strokeWidth: 1 };

  if (shape.type === "rect") {
    return <rect x={shape.x} y={shape.y} width={shape.width} height={shape.height} rx={shape.rx} {...paint} />;
  }
  if (shape.type === "ellipse") {
    return <ellipse cx={shape.cx} cy={shape.cy} rx={shape.rx} ry={shape.ry} {...paint} />;
  }
  return <path d={shape.d} {...paint} />;
}

/** Rendu d'une géométrie de zone, partagé par l'illustration et la couche interactive. */
export function shapeElementProps(shape: AnatomyShape): { element: "rect" | "ellipse" | "path"; props: Record<string, number | string | undefined> } {
  if (shape.type === "rect") {
    return { element: "rect", props: { x: shape.x, y: shape.y, width: shape.width, height: shape.height, rx: shape.rx } };
  }
  if (shape.type === "ellipse") {
    return { element: "ellipse", props: { cx: shape.cx, cy: shape.cy, rx: shape.rx, ry: shape.ry } };
  }
  return { element: "path", props: { d: shape.d } };
}
