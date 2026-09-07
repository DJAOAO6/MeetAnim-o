// Studio de documents — format de stockage d'un document (StudioDocument.contentJson).
// `formatVersion` permet une migration future du format sans casser les
// documents déjà enregistrés (voir prisma/schema.prisma, commentaire sur
// StudioDocument : JSON plutôt que sur-normalisé en table séparée).

export type DocumentPageSize = "A4_PORTRAIT" | "A4_LANDSCAPE";

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
};

export type DocumentShapeElement = {
  id: string;
  type: "shape";
  shape: "rect" | "line" | "circle";
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
  cornerRadius?: number;
  hidden?: boolean;
  opacity?: number;
};

export type DiagramMarker = {
  id: string;
  x: number;
  y: number;
  presetId: string;
  label: string;
};

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
};

export type DocumentElement = DocumentTextElement | DocumentImageElement | DocumentShapeElement | DocumentDiagramElement;

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
      if (element.type !== "shape") continue;
      if (element.fill && element.fill !== "transparent") colors.add(element.fill);
      if (element.stroke && element.stroke !== "transparent") colors.add(element.stroke);
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
