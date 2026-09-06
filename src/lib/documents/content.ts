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
};

export type DocumentElement = DocumentTextElement | DocumentImageElement | DocumentShapeElement | DocumentDiagramElement;

export type DocumentPage = {
  id: string;
  elements: DocumentElement[];
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
