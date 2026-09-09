// Placement anti-collision des libellés anatomiques — logique pure, testée
// sans navigateur (comme smart-guides.ts pour les repères du Studio).
//
// Principe repris des planches anatomiques imprimées : les libellés ne sont
// jamais posés sur l'anatomie, ils vivent dans une gouttière de part et
// d'autre de l'illustration et sont reliés à leur zone par une fine ligne de
// liaison. Chaque libellé part de la hauteur de sa zone, puis les
// chevauchements sont résolus en écartant verticalement le minimum
// nécessaire — l'ordre vertical des zones est toujours préservé, sans quoi
// les lignes de liaison se croiseraient.

export type LabelCandidate = {
  id: string;
  anchor: { x: number; y: number };
  title: string;
  subtitle?: string;
  color: string;
};

export type PlacedAnatomyLabel = LabelCandidate & {
  side: "left" | "right";
  /** Centre vertical du libellé après résolution des collisions. */
  y: number;
};

export type LabelPlacementOptions = {
  viewBox: { width: number; height: number };
  labelHeight: number;
  minGap: number;
  padding: number;
};

/**
 * Un libellé part du côté où se trouve sa zone : une zone dans la moitié
 * avant de l'animal va dans la gouttière gauche, une zone arrière dans la
 * droite. Ça répartit naturellement la charge et raccourcit les lignes de
 * liaison, au lieu d'empiler tout d'un seul côté.
 */
function sideFor(anchorX: number, width: number): "left" | "right" {
  return anchorX < width / 2 ? "left" : "right";
}

/**
 * Deux passes classiques : une descendante qui écarte chaque libellé du
 * précédent, puis une remontante qui rattrape le débordement en bas de cadre.
 * Sans la seconde, une grappe de zones basses pousserait le dernier libellé
 * hors du schéma.
 */
function resolveColumn(labels: PlacedAnatomyLabel[], options: LabelPlacementOptions): PlacedAnatomyLabel[] {
  if (labels.length === 0) return [];

  const step = options.labelHeight + options.minGap;
  const minY = options.padding + options.labelHeight / 2;
  const maxY = options.viewBox.height - options.padding - options.labelHeight / 2;

  const sorted = [...labels].sort((a, b) => a.anchor.y - b.anchor.y);

  const placed = sorted.map((label) => ({ ...label, y: Math.min(Math.max(label.anchor.y, minY), maxY) }));

  for (let index = 1; index < placed.length; index += 1) {
    const previous = placed[index - 1];
    if (placed[index].y < previous.y + step) placed[index].y = previous.y + step;
  }

  for (let index = placed.length - 1; index >= 0; index -= 1) {
    const limit = index === placed.length - 1 ? maxY : placed[index + 1].y - step;
    if (placed[index].y > limit) placed[index].y = limit;
  }

  // La remontée peut avoir fait passer le premier libellé au-dessus du cadre
  // quand il y a plus de libellés que de place : on rabat alors la colonne
  // dans le cadre, quitte à ce que l'espacement soit plus serré que minGap.
  if (placed[0].y < minY) {
    const shift = minY - placed[0].y;
    for (const label of placed) label.y = Math.min(label.y + shift, maxY);
  }

  return placed;
}

export function placeAnatomyLabels(candidates: LabelCandidate[], options: LabelPlacementOptions): PlacedAnatomyLabel[] {
  const left: PlacedAnatomyLabel[] = [];
  const right: PlacedAnatomyLabel[] = [];

  for (const candidate of candidates) {
    const side = sideFor(candidate.anchor.x, options.viewBox.width);
    (side === "left" ? left : right).push({ ...candidate, side, y: candidate.anchor.y });
  }

  return [...resolveColumn(left, options), ...resolveColumn(right, options)];
}
