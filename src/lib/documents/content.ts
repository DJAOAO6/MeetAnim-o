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
