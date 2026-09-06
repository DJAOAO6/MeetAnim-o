import { create } from "zustand";
import type { DocumentContent, DocumentElement, DocumentPage } from "@/lib/documents/content";
import type { DocumentVariableContext } from "@/lib/documents/variables";
import { DEFAULT_MARKER_PRESETS, type MarkerPreset } from "@/lib/documents/marker-presets";

const MAX_HISTORY = 50;

const EMPTY_VARIABLE_CONTEXT: DocumentVariableContext = { professional: null, client: null, animal: null, appointment: null };

// Rail du Studio (étape 6) — une seule catégorie ouverte à la fois, jamais
// persistée (ni en base, ni dans l'historique undo/redo : ce n'est pas du
// contenu du document, juste l'état d'affichage de l'éditeur).
export type SidebarCategory = "text" | "shapes" | "images" | "diagram" | "blocks" | "data" | "templates";

// Zoom (étape 10) — un `transform: scale()` CSS sur le conteneur commun au
// Stage Konva et à la surcouche texte (voir document-editor-view.tsx),
// jamais un rescale interne de Konva : les deux couches partagent déjà les
// mêmes coordonnées non mises à l'échelle, un seul scale sur leur ancêtre
// commun les zoome comme un seul bloc sans aucun nouveau calcul de
// coordonnées. Purement un état d'affichage, jamais persisté ni dans
// l'historique undo/redo.
export const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5];

function newElementIdForClone(type: DocumentElement["type"]): string {
  return `${type}-${Date.now()}-${Math.round(Math.random() * 100000)}`;
}

type DocumentStoreState = {
  content: DocumentContent;
  variableContext: DocumentVariableContext;
  markerPresets: MarkerPreset[];
  currentPageIndex: number;
  selectedElementId: string | null;
  // Distinct de la sélection : un texte peut être sélectionné (déplaçable,
  // redimensionnable) sans être en cours de frappe — seul un double-clic
  // bascule ici, voir text-overlay.tsx.
  editingTextId: string | null;
  // Non null pendant qu'un repère est en cours de pose sur le schéma
  // animalier (étape 4) : le prochain clic sur le schéma pose un marqueur
  // avec ce préréglage, voir canvas-stage.tsx et properties-panel.tsx.
  placingMarkerPresetId: string | null;
  openSidebarCategory: SidebarCategory | null;
  zoomLevel: number;
  // Pile d'annulation/rétablissement par snapshot complet du contenu — le
  // plus simple à raisonner correctement pour cette étape (pas de patchs
  // différentiels), amplement suffisant vu la taille d'un document.
  past: DocumentContent[];
  future: DocumentContent[];

  loadContent: (content: DocumentContent, variableContext?: DocumentVariableContext, markerPresets?: MarkerPreset[]) => void;
  setMarkerPresets: (presets: MarkerPreset[]) => void;
  setCurrentPageIndex: (index: number) => void;
  selectElement: (id: string | null) => void;
  setEditingText: (id: string | null) => void;
  setPlacingMarkerPreset: (presetId: string | null) => void;
  setSidebarCategory: (category: SidebarCategory | null) => void;
  setZoom: (level: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  addElement: (element: DocumentElement) => void;
  addElements: (elements: DocumentElement[]) => void;
  updateElement: (id: string, patch: Partial<DocumentElement>) => void;
  removeElement: (id: string) => void;
  duplicateSelected: () => void;
  removeSelected: () => void;
  addPage: () => void;
  duplicatePage: (index: number) => void;
  removePage: (index: number) => void;
  insertPageFromTemplate: (elements: DocumentElement[]) => void;
  undo: () => void;
  redo: () => void;
};

function currentPage(state: Pick<DocumentStoreState, "content" | "currentPageIndex">) {
  return state.content.pages[state.currentPageIndex];
}

function withPageElements(content: DocumentContent, pageIndex: number, elements: DocumentElement[]): DocumentContent {
  return { ...content, pages: content.pages.map((page, index) => (index === pageIndex ? { ...page, elements } : page)) };
}

// Copie profonde volontairement simple (JSON) — le contenu d'un document
// (positions/tailles/html) est toujours sérialisable, jamais de fonctions ni
// de références circulaires, donc pas besoin d'une bibliothèque dédiée ici.
function cloneContent(content: DocumentContent): DocumentContent {
  return JSON.parse(JSON.stringify(content)) as DocumentContent;
}

/**
 * Enregistre un instantané avant une modification — appelé au début de
 * chaque action qui touche `content`, jamais après (sinon l'annulation
 * ramènerait à l'état déjà modifié).
 */
function pushHistory(state: DocumentStoreState): Pick<DocumentStoreState, "past" | "future"> {
  const past = [...state.past, cloneContent(state.content)];
  if (past.length > MAX_HISTORY) past.shift();
  return { past, future: [] };
}

export const useDocumentStore = create<DocumentStoreState>((set, get) => ({
  content: { formatVersion: 1, pageSize: "A4_PORTRAIT", pages: [{ id: "page-1", elements: [] }] },
  variableContext: EMPTY_VARIABLE_CONTEXT,
  markerPresets: DEFAULT_MARKER_PRESETS,
  currentPageIndex: 0,
  selectedElementId: null,
  editingTextId: null,
  placingMarkerPresetId: null,
  openSidebarCategory: null,
  zoomLevel: 1,
  past: [],
  future: [],

  loadContent: (content, variableContext, markerPresets) => set({
    content,
    variableContext: variableContext ?? EMPTY_VARIABLE_CONTEXT,
    markerPresets: markerPresets ?? DEFAULT_MARKER_PRESETS,
    currentPageIndex: 0,
    selectedElementId: null,
    editingTextId: null,
    placingMarkerPresetId: null,
    openSidebarCategory: null,
    zoomLevel: 1,
    past: [],
    future: [],
  }),

  setMarkerPresets: (presets) => set({ markerPresets: presets }),

  setCurrentPageIndex: (index) => set({ currentPageIndex: index, selectedElementId: null, editingTextId: null }),

  selectElement: (id) => set({ selectedElementId: id }),

  setEditingText: (id) => set((state) => ({ editingTextId: id, selectedElementId: id ?? state.selectedElementId })),

  setPlacingMarkerPreset: (presetId) => set({ placingMarkerPresetId: presetId }),

  setSidebarCategory: (category) => set({ openSidebarCategory: category }),

  setZoom: (level) => set({ zoomLevel: level }),

  zoomIn: () => set((state) => {
    const next = ZOOM_STEPS.find((step) => step > state.zoomLevel + 0.001);
    return next ? { zoomLevel: next } : state;
  }),

  zoomOut: () => set((state) => {
    const steps = [...ZOOM_STEPS].reverse();
    const next = steps.find((step) => step < state.zoomLevel - 0.001);
    return next ? { zoomLevel: next } : state;
  }),

  resetZoom: () => set({ zoomLevel: 1 }),

  addElement: (element) => set((state) => {
    const page = currentPage(state);
    return {
      ...pushHistory(state),
      content: withPageElements(state.content, state.currentPageIndex, [...page.elements, element]),
      selectedElementId: element.id,
    };
  }),

  // Insertion groupée (Smart Blocks, editor-toolbar.tsx) — un seul instantané
  // d'historique pour tout le groupe, jamais un par élément (un "Annuler"
  // devrait retirer le bloc entier d'un coup, pas élément par élément).
  addElements: (elements) => set((state) => {
    const page = currentPage(state);
    return {
      ...pushHistory(state),
      content: withPageElements(state.content, state.currentPageIndex, [...page.elements, ...elements]),
      selectedElementId: null,
    };
  }),

  updateElement: (id, patch) => set((state) => {
    const page = currentPage(state);
    const elements = page.elements.map((element) => (element.id === id ? ({ ...element, ...patch } as DocumentElement) : element));
    return { ...pushHistory(state), content: withPageElements(state.content, state.currentPageIndex, elements) };
  }),

  removeElement: (id) => set((state) => {
    const page = currentPage(state);
    const elements = page.elements.filter((element) => element.id !== id);
    return {
      ...pushHistory(state),
      content: withPageElements(state.content, state.currentPageIndex, elements),
      selectedElementId: state.selectedElementId === id ? null : state.selectedElementId,
    };
  }),

  duplicateSelected: () => {
    const state = get();
    const selected = currentPage(state).elements.find((element) => element.id === state.selectedElementId);
    if (!selected) return;
    const copy: DocumentElement = { ...selected, id: `${selected.type}-${Date.now()}-${Math.round(Math.random() * 1000)}`, x: selected.x + 16, y: selected.y + 16 };
    get().addElement(copy);
  },

  removeSelected: () => {
    const id = get().selectedElementId;
    if (id) get().removeElement(id);
  },

  // Une page vide de plus, jamais un remplacement de la page actuelle — bascule
  // dessus immédiatement (comme un nouvel élément qui se sélectionne à la
  // création). Fait partie de `content`, donc annulable comme le reste.
  addPage: () => set((state) => {
    const newPage: DocumentPage = { id: `page-${Date.now()}`, elements: [] };
    const pages = [...state.content.pages, newPage];
    return {
      ...pushHistory(state),
      content: { ...state.content, pages },
      currentPageIndex: pages.length - 1,
      selectedElementId: null,
      editingTextId: null,
    };
  }),

  // Clone profond avec des id d'éléments neufs (jamais les id d'origine) —
  // deux pages ne doivent jamais partager le moindre id d'élément, même si
  // rien aujourd'hui n'en dépend strictement (une seule page est rendue à la
  // fois), pour rester sûr si une fonctionnalité future affichait plusieurs
  // pages en même temps (ex. vue d'ensemble).
  duplicatePage: (index) => set((state) => {
    const source = state.content.pages[index];
    if (!source) return state;
    const cloned = cloneContent({ formatVersion: 1, pageSize: state.content.pageSize, pages: [source] }).pages[0];
    const newPage: DocumentPage = {
      id: `page-${Date.now()}`,
      elements: cloned.elements.map((element) => ({ ...element, id: newElementIdForClone(element.type) })),
    };
    const pages = [...state.content.pages.slice(0, index + 1), newPage, ...state.content.pages.slice(index + 1)];
    return {
      ...pushHistory(state),
      content: { ...state.content, pages },
      currentPageIndex: index + 1,
      selectedElementId: null,
      editingTextId: null,
    };
  }),

  // Bloqué s'il ne reste qu'une seule page — un document a toujours au moins
  // une page. Recale l'index courant s'il pointait sur ou après la page
  // supprimée, pour ne jamais se retrouver sur un index hors bornes.
  removePage: (index) => set((state) => {
    if (state.content.pages.length <= 1) return state;
    const pages = state.content.pages.filter((_, pageIndex) => pageIndex !== index);
    const currentPageIndex = Math.min(state.currentPageIndex > index ? state.currentPageIndex - 1 : state.currentPageIndex, pages.length - 1);
    return {
      ...pushHistory(state),
      content: { ...state.content, pages },
      currentPageIndex,
      selectedElementId: null,
      editingTextId: null,
    };
  }),

  // Catégorie "Modèles" du rail (étape 10) : "insérer comme nouvelle page",
  // jamais "remplacer la page actuelle" (destructif et surprenant). Les
  // éléments arrivent avec des id déjà régénérés par l'appelant (voir
  // templates-panel.tsx) — un seul instantané d'historique pour toute
  // l'opération, comme un Smart Block.
  insertPageFromTemplate: (elements) => set((state) => {
    const newPage: DocumentPage = { id: `page-${Date.now()}`, elements };
    const pages = [...state.content.pages, newPage];
    return {
      ...pushHistory(state),
      content: { ...state.content, pages },
      currentPageIndex: pages.length - 1,
      selectedElementId: null,
      editingTextId: null,
    };
  }),

  undo: () => set((state) => {
    const previous = state.past[state.past.length - 1];
    if (!previous) return state;
    return {
      content: previous,
      past: state.past.slice(0, -1),
      future: [cloneContent(state.content), ...state.future].slice(0, MAX_HISTORY),
      selectedElementId: null,
    };
  }),

  redo: () => set((state) => {
    const next = state.future[0];
    if (!next) return state;
    return {
      content: next,
      past: [...state.past, cloneContent(state.content)].slice(-MAX_HISTORY),
      future: state.future.slice(1),
      selectedElementId: null,
    };
  }),
}));
