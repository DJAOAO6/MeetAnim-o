import type { AnatomyViewId } from "@/lib/anatomy/views";

// Studio de documents — format de stockage d'un document (StudioDocument.contentJson).
// `formatVersion` permet une migration future du format sans casser les
// documents déjà enregistrés (voir prisma/schema.prisma, commentaire sur
// StudioDocument : JSON plutôt que sur-normalisé en table séparée).

// A4 : compte rendu (portrait/paysage). POSTER_A3_PORTRAIT : affiche
// (étape 26). SOCIAL_SQUARE/SOCIAL_PORTRAIT : posts Instagram carré/portrait
// (étape 26) — voir page-geometry.ts pour les dimensions et leur convention.
// Choisi à la création du document uniquement (pas de changement de format
// après coup, explicitement hors périmètre — voir le plan).
export type DocumentPageSize = "A4_PORTRAIT" | "A4_LANDSCAPE" | "POSTER_A3_PORTRAIT" | "SOCIAL_SQUARE" | "SOCIAL_PORTRAIT";

export type DocumentTextElement = {
  id: string;
  type: "text";
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  // Sortie Tiptap (HTML) — jamais du texte Konva natif, voir le plan
  // (édition réelle via une surcouche DOM/Tiptap positionnée sur le canvas).
  html: string;
  // Ex. "animal.name" — présent uniquement si ce bloc reflète une variable
  // Animéo plutôt qu'un texte libre (src/lib/documents/variables.ts).
  variableBinding?: string;
  // Masqué depuis le panneau Calques (étape 11) — absent du rendu ET de
  // l'export PDF (les deux filtrent sur ce champ, aucun code spécifique à
  // l'export). `undefined`/`false` = visible, comportement des documents
  // déjà enregistrés avant l'étape 11 inchangé.
  hidden?: boolean;
  // 0-1, optionnel — absent = 1 (opaque), comportement déjà codé en dur
  // avant l'étape 16, aucune migration des documents existants.
  opacity?: number;
  // Verrouillage (étape 25) — un élément verrouillé reste visible et
  // sélectionnable (au clic simple, jamais par glisser) mais ne peut plus
  // être déplacé/redimensionné/tourné/dupliqué/supprimé/aligné (voir
  // document-store.ts et canvas-stage.tsx). `undefined`/`false` = déverrouillé,
  // aucune migration des documents existants.
  locked?: boolean;
};

export type DocumentImageElement = {
  id: string;
  type: "image";
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  // Data URI (convention base64-dans-Postgres de toute l'app, voir le plan).
  src: string;
  hidden?: boolean;
  opacity?: number;
  // Verrouillage (étape 25) — voir le commentaire sur DocumentTextElement.locked.
  locked?: boolean;
};

export type DocumentShapeElement = {
  id: string;
  type: "shape";
  // ellipse/triangle/hexagon/star sont centrées par construction chez Konva
  // (Ellipse/RegularPolygon/Star) — rendues avec un offset pour que x/y
  // représente quand même le coin haut-gauche de la boîte englobante,
  // comme toutes les autres formes (voir canvas-stage.tsx, étape 19).
  // diamond/arrow/chevron sont construites via des points explicites
  // (Line/Arrow), déjà naturellement ancrées en haut-gauche.
  shape: "rect" | "line" | "circle" | "ellipse" | "triangle" | "hexagon" | "diamond" | "star" | "arrow" | "chevron";
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  fill: string;
  stroke: string;
  // Optionnels, valeur par défaut = comportement déjà codé en dur avant
  // l'étape 11 (1 et 4) — aucune migration des documents existants.
  strokeWidth?: number;
  // Pointillé (étape 20) — applicable à line/arrow/chevron.
  dashed?: boolean;
  // Deuxième pointe de flèche (étape 20) — applicable à shape:"arrow" seul.
  doubleArrow?: boolean;
  cornerRadius?: number;
  hidden?: boolean;
  opacity?: number;
  // Verrouillage (étape 25) — voir le commentaire sur DocumentTextElement.locked.
  locked?: boolean;
};

export type DiagramMarker = {
  id: string;
  x: number;
  y: number;
  presetId: string;
  label: string;
};

/**
 * OBSOLÈTE depuis l'étape 31 — remplacé par `DocumentAnatomyElement`.
 *
 * Ses repères sont des coordonnées libres posées au clic, sans lien avec une
 * structure anatomique nommée : rien n'en était exploitable (ni recherche, ni
 * statistiques par zone, ni cohérence entre deux comptes rendus), et son
 * illustration est une silhouette dessinée à la main, écartée depuis.
 *
 * Le type est CONSERVÉ, et son rendu Konva avec lui, pour que les documents
 * déjà enregistrés continuent de s'afficher et de se ré-exporter à
 * l'identique. Aucun nouvel élément de ce type n'est plus insérable.
 */
export type DocumentDiagramElement = {
  id: string;
  type: "diagram";
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  species: "dog";
  view: "profile-left";
  markers: DiagramMarker[];
  // Légende générée automatiquement à partir de `markers` — jamais éditée
  // à la main, seulement affichée/masquée.
  showLegend: boolean;
  hidden?: boolean;
  opacity?: number;
  // Verrouillage (étape 25) — voir le commentaire sur DocumentTextElement.locked.
  locked?: boolean;
};

export type DocumentIconElement = {
  id: string;
  type: "icon";
  // Référence vers STUDIO_ICONS (studio-icons.ts) — le tracé SVG n'est
  // jamais stocké dans l'élément (plus léger, et corriger le dessin d'une
  // icône profite à tous les documents qui l'utilisent, comme les polices).
  iconName: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  // Une icône est un pictogramme monochrome (pas de remplissage/contour
  // distincts comme une forme).
  color: string;
  strokeWidth?: number;
  hidden?: boolean;
  opacity?: number;
  // Verrouillage (étape 25) — voir le commentaire sur DocumentTextElement.locked.
  locked?: boolean;
};

/**
 * Observation ancrée à une structure anatomique nommée (étape 31) — remplace
 * les repères à coordonnées libres de `DocumentDiagramElement`, qui ne
 * portaient aucun sens exploitable (voir le commentaire sur ce type).
 */
export type AnatomyObservationEntry = {
  id: string;
  /** Référence au référentiel anatomique (src/lib/anatomy/taxonomy.ts). */
  zoneId: string;
  /** Type d'observation, préréglage partagé par le cabinet (marker-presets.ts). */
  presetId: string;
  /** Observation libre et courte, propre à cette zone pour ce document. */
  note?: string;
};

/**
 * Schéma anatomique interactif (étape 31). Contrairement au
 * `DocumentDiagramElement` qu'il remplace, il n'est PAS rendu par Konva : sa
 * couche visuelle est du DOM/SVG posé par-dessus le Stage (même patron que
 * le texte, voir text-overlay.tsx), seule façon d'avoir survol, infobulle,
 * focus clavier et transitions. Konva n'en garde qu'un rectangle fantôme
 * pour la sélection et le redimensionnement.
 */
export type DocumentAnatomyElement = {
  id: string;
  type: "anatomy";
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  /** Espèce ET vue en une seule clé : « dog.lateral-left » (lib/anatomy/views.ts). */
  viewId: AnatomyViewId;
  observations: AnatomyObservationEntry[];
  /** Libellés reliés aux zones observées — remplacent l'ancienne légende. */
  showLabels: boolean;
  hidden?: boolean;
  opacity?: number;
  locked?: boolean;
};

export type DocumentElement =
  | DocumentTextElement
  | DocumentImageElement
  | DocumentShapeElement
  | DocumentDiagramElement
  | DocumentAnatomyElement
  | DocumentIconElement;

// Couleur unie uniquement dans ce chantier (étape 16) — dégradé/image de
// fond explicitement hors périmètre, voir le plan ("ne surcharge pas
// inutilement le modèle"). Absent = blanc, comportement actuel inchangé,
// aucune migration des documents existants.
export type DocumentPageBackground = { type: "color"; value: string };

export type DocumentPage = {
  id: string;
  elements: DocumentElement[];
  background?: DocumentPageBackground;
};

export type DocumentContent = {
  formatVersion: 1;
  pageSize: DocumentPageSize;
  pages: DocumentPage[];
};

export function createEmptyDocumentContent(pageSize: DocumentPageSize = "A4_PORTRAIT"): DocumentContent {
  return { formatVersion: 1, pageSize, pages: [{ id: "page-1", elements: [] }] };
}

/**
 * Légende de champ en petites majuscules — même style inline utilisé par les
 * modèles seedés (prisma/seed-document-templates.ts) et les Smart Blocks
 * (editor/panels/smart-blocks-panel.tsx), pour ne l'écrire qu'à un seul
 * endroit. Du texte libre (`html`), pas un nouveau mécanisme de rendu.
 */
export function captionHtml(label: string): string {
  return `<p style="margin:0;font-size:9px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#8a97a0">${label}</p>`;
}

/**
 * Couleurs réellement utilisées dans le document courant (étape 16) — pour
 * la section "Couleurs du document" du ColorPicker. Dérivées uniquement des
 * formes (fill/stroke) : le texte peut porter une couleur par caractère via
 * Tiptap, en extraire une liste fiable depuis le HTML serait un chantier à
 * part, hors périmètre ici.
 */
export function collectDocumentColors(content: DocumentContent): string[] {
  const colors = new Set<string>();
  for (const page of content.pages) {
    for (const element of page.elements) {
      if (element.type === "shape") {
        if (element.fill && element.fill !== "transparent") colors.add(element.fill);
        if (element.stroke && element.stroke !== "transparent") colors.add(element.stroke);
      } else if (element.type === "icon") {
        if (element.color && element.color !== "transparent") colors.add(element.color);
      }
    }
  }
  return Array.from(colors);
}

export type DocumentLayoutSketchItem = { type: string; x: number; y: number; width: number; height: number; fill?: string };

/**
 * Réduit le contenu d'un document en géométrie/couleurs pures — pour la
 * galerie de modèles (étape 7) : jamais `html`/`src` (texte réel ou image
 * base64), pour ne jamais exposer le contenu d'un modèle dans une simple
 * liste ni l'alourdir. Un croquis de mise en page, pas une capture d'écran.
 */
export function buildLayoutSketch(content: DocumentContent): DocumentLayoutSketchItem[] {
  const page = content.pages[0];
  if (!page) return [];
  return page.elements.map((element) => ({
    type: element.type,
    x: element.x,
    y: element.y,
    width: element.width,
    height: element.height,
    fill: element.type === "shape" ? element.fill : undefined,
  }));
}
