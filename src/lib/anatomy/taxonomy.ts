// Référentiel anatomique — donnée métier ostéopathique, délibérément hors de
// src/lib/documents/ : il ne dépend ni du Studio, ni de Konva, ni de Prisma,
// et doit rester réutilisable ailleurs (fiche animal, écran de consultation).
//
// L'ID d'une structure est LA clé partagée par les trois modes de sélection
// (clic sur le schéma, autocomplete, liste anatomique) — c'est ce qui rend
// leur divergence impossible par construction. Un ID ne doit donc jamais
// changer une fois des observations enregistrées avec.

export type AnatomyLevel = "region" | "joint" | "structure";

export type AnatomySide = "left" | "right";

export type AnatomyNode = {
  id: string;
  /** Libellé complet, avec le côté : « Genou gauche » (aria-label, liste). */
  label: string;
  /** Libellé court quand le côté est déjà porté par le contexte : « Genou ». */
  shortLabel?: string;
  level: AnatomyLevel;
  side?: AnatomySide;
  /** Termes vétérinaires alternatifs, pour l'autocomplete (« grasset »). */
  synonyms?: string[];
  children?: AnatomyNode[];
};

function sideLabel(side: AnatomySide): string {
  return side === "left" ? "gauche" : "droite";
}

/**
 * Vertèbres d'un segment : le chien a 7 cervicales, 13 thoraciques et
 * 7 lombaires (formule vertébrale C7-T13-L7-S3). C1 et C2 portent leur nom
 * usuel — ce sont les deux repères les plus manipulés du rachis cervical.
 */
function vertebrae(segmentId: string, prefix: "C" | "T" | "L", count: number, names: Record<number, string> = {}): AnatomyNode[] {
  return Array.from({ length: count }, (_, index) => {
    const rank = index + 1;
    const code = `${prefix}${rank}`;
    const name = names[rank];
    return {
      id: `${segmentId}.${code.toLowerCase()}`,
      label: name ? `${code} (${name})` : code,
      level: "structure" as const,
      synonyms: name ? [name] : undefined,
    };
  });
}

function limbSegment(
  root: string,
  regionLabel: string,
  side: AnatomySide,
  parts: Array<{ key: string; label: string; level: AnatomyLevel; synonyms?: string[] }>,
): AnatomyNode {
  const id = `${root}.${side}`;
  return {
    id,
    label: `${regionLabel} ${sideLabel(side)}`,
    shortLabel: regionLabel,
    level: "region",
    side,
    children: parts.map((part) => ({
      id: `${id}.${part.key}`,
      label: `${part.label} ${sideLabel(side)}`,
      shortLabel: part.label,
      level: part.level,
      side,
      synonyms: part.synonyms,
    })),
  };
}

const FORELIMB_PARTS = [
  { key: "scapula", label: "Scapula", level: "structure" as const, synonyms: ["omoplate"] },
  { key: "shoulder", label: "Épaule", level: "joint" as const, synonyms: ["scapulo-humérale"] },
  { key: "humerus", label: "Humérus", level: "structure" as const },
  { key: "elbow", label: "Coude", level: "joint" as const, synonyms: ["huméro-radio-ulnaire"] },
  { key: "carpus", label: "Carpe", level: "joint" as const, synonyms: ["poignet"] },
];

const HINDLIMB_PARTS = [
  { key: "hip", label: "Hanche", level: "joint" as const, synonyms: ["coxo-fémorale"] },
  { key: "femur", label: "Fémur", level: "structure" as const },
  { key: "knee", label: "Genou", level: "joint" as const, synonyms: ["grasset", "fémoro-tibiale"] },
  { key: "tarsus", label: "Tarse", level: "joint" as const, synonyms: ["jarret"] },
];

/**
 * Le bassin est modélisé UNE SEULE FOIS au niveau axial, pas dupliqué dans
 * chaque membre postérieur : c'est une structure médiane impaire, la
 * dupliquer par côté serait anatomiquement faux. Seules les sacro-iliaques,
 * qui sont bien paires, portent un côté.
 */
const DOG_ANATOMY: AnatomyNode = {
  id: "dog",
  label: "Chien",
  level: "region",
  children: [
    {
      id: "dog.head",
      label: "Tête",
      level: "region",
      children: [
        { id: "dog.head.skull", label: "Crâne", level: "structure" },
        { id: "dog.head.mandible", label: "Mandibule", level: "structure", synonyms: ["mâchoire"] },
        { id: "dog.head.tmj", label: "Articulation temporo-mandibulaire", shortLabel: "ATM", level: "joint", synonyms: ["ATM"] },
      ],
    },
    {
      id: "dog.spine",
      label: "Rachis",
      level: "region",
      synonyms: ["colonne", "colonne vertébrale"],
      children: [
        {
          id: "dog.spine.occiput_c1",
          label: "Charnière occiput-C1",
          level: "joint",
          synonyms: ["atlanto-occipitale", "OAA"],
        },
        {
          id: "dog.spine.cervical",
          label: "Cervicales",
          level: "region",
          synonyms: ["rachis cervical", "encolure"],
          children: vertebrae("dog.spine.cervical", "C", 7, { 1: "Atlas", 2: "Axis" }),
        },
        {
          id: "dog.spine.c7_t1",
          label: "Charnière C7-T1",
          level: "joint",
          synonyms: ["cervico-thoracique", "C7T1"],
        },
        {
          id: "dog.spine.thoracic",
          label: "Thoraciques",
          level: "region",
          synonyms: ["rachis thoracique", "dorsales"],
          children: vertebrae("dog.spine.thoracic", "T", 13),
        },
        {
          id: "dog.spine.t13_l1",
          label: "Charnière thoraco-lombaire",
          level: "joint",
          synonyms: ["T13-L1"],
        },
        {
          id: "dog.spine.lumbar",
          label: "Lombaires",
          level: "region",
          synonyms: ["rachis lombaire", "dos"],
          children: vertebrae("dog.spine.lumbar", "L", 7),
        },
        {
          id: "dog.spine.l7_s1",
          label: "Charnière lombo-sacrée",
          level: "joint",
          synonyms: ["L7-S1", "lombosacrée"],
        },
        { id: "dog.spine.sacrum", label: "Sacrum", level: "structure" },
        { id: "dog.spine.tail", label: "Queue", level: "region", synonyms: ["coccygiennes", "caudales"] },
      ],
    },
    {
      id: "dog.thorax",
      label: "Thorax",
      level: "region",
      children: [
        { id: "dog.thorax.sternum", label: "Sternum", level: "structure" },
        { id: "dog.thorax.ribs", label: "Côtes", level: "structure", synonyms: ["grill costal", "gril costal"] },
        { id: "dog.thorax.diaphragm", label: "Diaphragme", level: "structure" },
      ],
    },
    {
      id: "dog.pelvis",
      label: "Bassin",
      level: "region",
      children: [
        { id: "dog.pelvis.sacroiliac.left", label: "Sacro-iliaque gauche", shortLabel: "Sacro-iliaque", level: "joint", side: "left" },
        { id: "dog.pelvis.sacroiliac.right", label: "Sacro-iliaque droite", shortLabel: "Sacro-iliaque", level: "joint", side: "right" },
      ],
    },
    limbSegment("dog.forelimb", "Membre antérieur", "left", FORELIMB_PARTS),
    limbSegment("dog.forelimb", "Membre antérieur", "right", FORELIMB_PARTS),
    limbSegment("dog.hindlimb", "Membre postérieur", "left", HINDLIMB_PARTS),
    limbSegment("dog.hindlimb", "Membre postérieur", "right", HINDLIMB_PARTS),
  ],
};

export type AnatomySpeciesId = "dog";

export const ANATOMY_BY_SPECIES: Record<AnatomySpeciesId, AnatomyNode> = {
  dog: DOG_ANATOMY,
};

/** Aplatit l'arbre en profondeur d'abord — l'ordre de lecture de la liste. */
export function flattenAnatomy(node: AnatomyNode): AnatomyNode[] {
  return [node, ...(node.children ?? []).flatMap(flattenAnatomy)];
}

const INDEX_BY_ID = new Map<string, AnatomyNode>();
const PARENT_BY_ID = new Map<string, AnatomyNode | null>();

for (const root of Object.values(ANATOMY_BY_SPECIES)) {
  PARENT_BY_ID.set(root.id, null);
  for (const node of flattenAnatomy(root)) {
    INDEX_BY_ID.set(node.id, node);
    for (const child of node.children ?? []) PARENT_BY_ID.set(child.id, node);
  }
}

export function findAnatomyNode(id: string): AnatomyNode | null {
  return INDEX_BY_ID.get(id) ?? null;
}

/**
 * Fil d'Ariane racine → nœud, pour le tooltip et la liste :
 * « Rachis › Lombaires › L5 ». Retourne [] pour un id inconnu plutôt que de
 * lever — un document peut référencer une zone d'une version ultérieure du
 * référentiel, ce n'est pas une raison pour faire tomber l'éditeur.
 */
export function anatomyPath(id: string): AnatomyNode[] {
  const path: AnatomyNode[] = [];
  let current = findAnatomyNode(id);
  while (current) {
    path.unshift(current);
    current = PARENT_BY_ID.get(current.id) ?? null;
  }
  return path;
}

function normalizeForSearch(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase("fr-FR")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

/**
 * Autocomplete : cherche dans le libellé ET les synonymes vétérinaires, sans
 * accent ni casse (« grasset » trouve le genou, « omoplate » la scapula).
 * La racine de l'espèce est exclue — « Chien » n'est pas une zone
 * sélectionnable, c'est le référentiel lui-même.
 */
export function searchAnatomy(speciesId: AnatomySpeciesId, query: string, limit = 8): AnatomyNode[] {
  const normalized = normalizeForSearch(query);
  if (!normalized) return [];

  const root = ANATOMY_BY_SPECIES[speciesId];
  const candidates = flattenAnatomy(root).filter((node) => node.id !== root.id);

  const scored: Array<{ node: AnatomyNode; score: number }> = [];
  for (const node of candidates) {
    const haystacks = [node.label, ...(node.synonyms ?? [])].map(normalizeForSearch);
    let best = -1;
    for (const haystack of haystacks) {
      if (haystack.startsWith(normalized)) best = Math.max(best, 2);
      else if (haystack.includes(normalized)) best = Math.max(best, 1);
    }
    if (best > 0) scored.push({ node, score: best });
  }

  // Un préfixe l'emporte sur une correspondance au milieu du mot ; à score
  // égal, l'ordre de l'arbre (anatomique) plutôt qu'alphabétique.
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.node);
}

/** Zones réellement sélectionnables : tout sauf la racine de l'espèce. */
export function selectableAnatomyNodes(speciesId: AnatomySpeciesId): AnatomyNode[] {
  const root = ANATOMY_BY_SPECIES[speciesId];
  return flattenAnatomy(root).filter((node) => node.id !== root.id);
}
