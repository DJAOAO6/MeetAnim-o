// Cartes de zones interactives — une par vue anatomique.
//
// Séparées de l'illustration elle-même : une hitbox n'est qu'une géométrie
// exprimée dans le viewBox de la vue. Remplacer l'illustration par une
// meilleure ne demande donc que de réaligner les coordonnées de ce fichier,
// jamais de toucher à la logique métier ni au référentiel (taxonomy.ts).

import { findAnatomyNode, type AnatomySide, type AnatomySpeciesId } from "@/lib/anatomy/taxonomy";

export type AnatomyViewId = "dog.lateral-left" | "dog.lateral-right" | "dog.dorsal" | "dog.ventral";

export type AnatomyShape =
  | { type: "rect"; x: number; y: number; width: number; height: number; rx?: number }
  | { type: "ellipse"; cx: number; cy: number; rx: number; ry: number }
  | { type: "path"; d: string };

export type AnatomyHitbox = {
  zoneId: string;
  shape: AnatomyShape;
  /** Point d'attache de la ligne de liaison du libellé (étape 30). */
  labelAnchor: { x: number; y: number };
};

export type AnatomyView = {
  id: AnatomyViewId;
  speciesId: AnatomySpeciesId;
  label: string;
  viewBox: { width: number; height: number };
  /**
   * Côté de l'animal réellement exposé par la vue : une latérale gauche ne
   * peut pas porter les zones du membre droit (elles sont derrière l'animal).
   * Les structures médianes (rachis, sternum, bassin) n'ont pas de côté et
   * apparaissent dans les deux vues.
   */
  sideVisible: AnatomySide | null;
  /**
   * Vrai tant que l'illustration anatomique définitive n'est pas intégrée.
   * L'interface DOIT alors afficher que le schéma est provisoire — il ne
   * doit jamais être présenté comme le rendu final.
   */
  awaitingIllustration: boolean;
  hitboxes: AnatomyHitbox[];
};

const VIEW_BOX = { width: 1000, height: 560 };

function rect(x: number, y: number, width: number, height: number): AnatomyShape {
  return { type: "rect", x, y, width, height, rx: 10 };
}

function centerOf(shape: AnatomyShape): { x: number; y: number } {
  if (shape.type === "rect") return { x: shape.x + shape.width / 2, y: shape.y + shape.height / 2 };
  if (shape.type === "ellipse") return { x: shape.cx, y: shape.cy };
  return { x: 0, y: 0 };
}

function box(zoneId: string, shape: AnatomyShape, labelAnchor?: { x: number; y: number }): AnatomyHitbox {
  return { zoneId, shape, labelAnchor: labelAnchor ?? centerOf(shape) };
}

/**
 * Géométrie PROVISOIRE de la vue latérale gauche du chien : une disposition
 * schématique en position anatomique (tête à l'avant, rachis cervical →
 * sacrum d'avant en arrière, membres sous le tronc), destinée à être
 * remplacée coordonnée par coordonnée dès que l'illustration définitive est
 * fournie. Ce n'est délibérément pas un dessin d'animal — c'est la carte
 * interactive, affichée telle quelle tant que l'illustration manque.
 */
const DOG_LATERAL_LEFT_HITBOXES: AnatomyHitbox[] = [
  // Tête
  box("dog.head.skull", { type: "ellipse", cx: 132, cy: 150, rx: 66, ry: 48 }),
  box("dog.head.mandible", rect(78, 190, 108, 30)),
  box("dog.head.tmj", { type: "ellipse", cx: 186, cy: 176, rx: 22, ry: 20 }),

  // Rachis, d'avant en arrière
  box("dog.spine.occiput_c1", { type: "ellipse", cx: 214, cy: 136, rx: 24, ry: 22 }),
  box("dog.spine.cervical", rect(238, 116, 132, 44)),
  box("dog.spine.c7_t1", { type: "ellipse", cx: 388, cy: 130, rx: 24, ry: 24 }),
  box("dog.spine.thoracic", rect(412, 108, 226, 44)),
  box("dog.spine.t13_l1", { type: "ellipse", cx: 656, cy: 126, rx: 24, ry: 24 }),
  box("dog.spine.lumbar", rect(680, 106, 148, 44)),
  box("dog.spine.l7_s1", { type: "ellipse", cx: 846, cy: 124, rx: 22, ry: 22 }),
  box("dog.spine.sacrum", rect(866, 104, 62, 40)),
  box("dog.spine.tail", rect(936, 108, 52, 26)),

  // Thorax et bassin
  box("dog.thorax.ribs", rect(414, 168, 222, 122)),
  box("dog.thorax.sternum", rect(430, 300, 176, 30)),
  box("dog.thorax.diaphragm", rect(614, 172, 44, 118)),
  box("dog.pelvis", rect(838, 158, 118, 74)),
  box("dog.pelvis.sacroiliac.left", { type: "ellipse", cx: 858, cy: 152, rx: 26, ry: 22 }),

  // Membre antérieur gauche
  box("dog.forelimb.left.scapula", rect(384, 172, 56, 96)),
  box("dog.forelimb.left.shoulder", { type: "ellipse", cx: 396, cy: 286, rx: 30, ry: 28 }),
  box("dog.forelimb.left.humerus", rect(372, 316, 44, 82)),
  box("dog.forelimb.left.elbow", { type: "ellipse", cx: 392, cy: 412, rx: 26, ry: 24 }),
  box("dog.forelimb.left.carpus", { type: "ellipse", cx: 396, cy: 486, rx: 24, ry: 22 }),

  // Membre postérieur gauche
  box("dog.hindlimb.left.hip", { type: "ellipse", cx: 884, cy: 244, rx: 32, ry: 30 }),
  box("dog.hindlimb.left.femur", rect(856, 278, 46, 84)),
  box("dog.hindlimb.left.knee", { type: "ellipse", cx: 878, cy: 378, rx: 28, ry: 26 }),
  box("dog.hindlimb.left.tarsus", { type: "ellipse", cx: 872, cy: 468, rx: 26, ry: 24 }),
];

function mirrorShape(shape: AnatomyShape, width: number): AnatomyShape {
  if (shape.type === "rect") return { ...shape, x: width - shape.x - shape.width };
  if (shape.type === "ellipse") return { ...shape, cx: width - shape.cx };
  return shape;
}

/**
 * Vue latérale droite dérivée de la gauche par symétrie, avec bascule des
 * identifiants latéralisés (`.left.` → `.right.`). C'est une commodité de
 * placeholder : une illustration réelle n'est jamais un miroir exact, chaque
 * vue livrée aura sa propre carte écrite à la main.
 */
function mirrorHitboxes(hitboxes: AnatomyHitbox[], width: number): AnatomyHitbox[] {
  return hitboxes.map((hitbox) => {
    const shape = mirrorShape(hitbox.shape, width);
    return {
      zoneId: hitbox.zoneId.replace(".left.", ".right.").replace(/\.left$/, ".right"),
      shape,
      labelAnchor: { x: width - hitbox.labelAnchor.x, y: hitbox.labelAnchor.y },
    };
  });
}

export const ANATOMY_VIEWS: Record<AnatomyViewId, AnatomyView | null> = {
  "dog.lateral-left": {
    id: "dog.lateral-left",
    speciesId: "dog",
    label: "Vue latérale gauche",
    viewBox: VIEW_BOX,
    sideVisible: "left",
    awaitingIllustration: true,
    hitboxes: DOG_LATERAL_LEFT_HITBOXES,
  },
  "dog.lateral-right": {
    id: "dog.lateral-right",
    speciesId: "dog",
    label: "Vue latérale droite",
    viewBox: VIEW_BOX,
    sideVisible: "right",
    awaitingIllustration: true,
    hitboxes: mirrorHitboxes(DOG_LATERAL_LEFT_HITBOXES, VIEW_BOX.width),
  },
  // Architecture prête, cartes non écrites : ces vues n'ont de sens qu'avec
  // une illustration dorsale/ventrale réelle (les zones y sont disposées
  // tout autrement, aucune symétrie ne les dérive de la latérale).
  "dog.dorsal": null,
  "dog.ventral": null,
};

export function getAnatomyView(id: AnatomyViewId): AnatomyView | null {
  return ANATOMY_VIEWS[id];
}

export const AVAILABLE_ANATOMY_VIEWS: AnatomyView[] = Object.values(ANATOMY_VIEWS).filter(
  (view): view is AnatomyView => view !== null,
);

/**
 * Zones du référentiel absentes de la carte d'une vue — utile pour la liste
 * anatomique, qui doit signaler ce qui n'est pas cliquable sur le schéma
 * courant plutôt que de laisser croire à un clic sans effet.
 */
export function hitboxZoneIds(view: AnatomyView): Set<string> {
  return new Set(view.hitboxes.map((hitbox) => hitbox.zoneId));
}

/** Le libellé d'une hitbox vient toujours du référentiel, jamais de la carte. */
export function hitboxLabel(hitbox: AnatomyHitbox): string {
  return findAnatomyNode(hitbox.zoneId)?.label ?? hitbox.zoneId;
}
