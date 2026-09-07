import { create } from "zustand";
import type { DocumentContent, DocumentElement, DocumentPage } from "@/lib/documents/content";
import type { DocumentVariableContext } from "@/lib/documents/variables";
import { DEFAULT_MARKER_PRESETS, type MarkerPreset } from "@/lib/documents/marker-presets";

const MAX_HISTORY = 50;

const EMPTY_VARIABLE_CONTEXT: DocumentVariableContext = { professional: null, client: null, animal: null, appointment: null };

// Rail du Studio (étape 6) — une seule catégorie ouverte à la fois, jamais
// persistée (ni en base, ni dans l'historique undo/redo : ce n'est pas du
// contenu du document, juste l'état d'affichage de l'éditeur).
export type SidebarCategory = "text" | "shapes" | "lines" | "icons" | "images" | "diagram" | "blocks" | "data" | "templates";

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
  // Sélection multiple (étape 13) — tableau vide = aucune sélection, jamais
  // `null` pour un cas "aucun" (garde un seul type à vérifier partout). Voir
  // `useSelectedElementId()` plus bas pour les consommateurs à un seul
  // élément (Propriétés en mode simple, édition de texte).
  selectedElementIds: string[];
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
  // `options.additive` : bascule l'élément dans/hors de la sélection actuelle
  // (Shift+clic) au lieu de la remplacer — voir canvas-stage.tsx/layers-panel.tsx.
  selectElement: (id: string | null, options?: { additive?: boolean }) => void;
  // Remplace toute la sélection d'un coup (sélection par glisser sur le
  // canvas, voir canvas-stage.tsx).
  selectElements: (ids: string[]) => void;
  toggleElementSelection: (id: string) => void;
  clearSelection: () => void;
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
  setElementHidden: (id: string, hidden: boolean) => void;
  setElementLocked: (id: string, locked: boolean) => void;
  moveElementUp: (id: string) => void;
  moveElementDown: (id: string) => void;
  duplicateSelected: () => void;
  removeSelected: () => void;
  alignSelected: (edge: "left" | "centerX" | "right" | "top" | "centerY" | "bottom") => void;
  distributeSelected: (axis: "horizontal" | "vertical") => void;
  addPage: () => void;
  duplicatePage: (index: number) => void;
  removePage: (index: number) => void;
  // `color: null` retire le fond (retour au blanc par défaut).
  setPageBackground: (pageIndex: number, color: string | null) => void;
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

// Verrouillage (étape 25) — un élément verrouillé reste sélectionnable (pour
// le retrouver et le déverrouiller) mais Suppr/Ctrl+D/alignement/distribution
// doivent l'ignorer silencieusement s'il fait partie de la sélection
// courante. Factorisé ici plutôt que dupliqué dans les 4 actions qui en ont
// besoin (duplicateSelected/removeSelected/alignSelected/distributeSelected).
function unlockedSelectedIds(page: DocumentPage, selectedElementIds: string[]): Set<string> {
  const lockedIds = new Set(page.elements.filter((element) => element.locked).map((element) => element.id));
  return new Set(selectedElementIds.filter((id) => !lockedIds.has(id)));
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
  selectedElementIds: [],
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
    selectedElementIds: [],
    editingTextId: null,
    placingMarkerPresetId: null,
    openSidebarCategory: null,
    zoomLevel: 1,
    past: [],
    future: [],
  }),

  setMarkerPresets: (presets) => set({ markerPresets: presets }),

  setCurrentPageIndex: (index) => set({ currentPageIndex: index, selectedElementIds: [], editingTextId: null }),

  toggleElementSelection: (id) => set((state) => {
    const exists = state.selectedElementIds.includes(id);
    return { selectedElementIds: exists ? state.selectedElementIds.filter((selectedId) => selectedId !== id) : [...state.selectedElementIds, id] };
  }),

  selectElement: (id, options) => {
    if (id === null) {
      set({ selectedElementIds: [] });
      return;
    }
    if (options?.additive) {
      get().toggleElementSelection(id);
      return;
    }
    set({ selectedElementIds: [id] });
  },

  selectElements: (ids) => set({ selectedElementIds: ids }),

  clearSelection: () => set({ selectedElementIds: [] }),

  // Entrer en édition de texte ramène toujours à une sélection simple : on
  // édite un seul bloc à la fois, jamais plusieurs en même temps.
  setEditingText: (id) => set((state) => ({ editingTextId: id, selectedElementIds: id ? [id] : state.selectedElementIds })),

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
      selectedElementIds: [element.id],
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
      selectedElementIds: [],
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
      selectedElementIds: state.selectedElementIds.filter((selectedId) => selectedId !== id),
    };
  }),

  // Panneau Calques (étape 11) — un élément masqué est absent du rendu
  // (canvas-stage.tsx/text-overlay.tsx filtrent sur `hidden`) et donc aussi
  // de l'export PDF, sans code spécifique à l'export. La sélection reste
  // possible depuis Calques même masqué (aucun changement nécessaire côté
  // `selectElement`, déjà appelable depuis n'importe où).
  setElementHidden: (id, hidden) => set((state) => {
    const page = currentPage(state);
    const elements = page.elements.map((element) => (element.id === id ? ({ ...element, hidden } as DocumentElement) : element));
    return { ...pushHistory(state), content: withPageElements(state.content, state.currentPageIndex, elements) };
  }),

  // Même mécanisme exact que setElementHidden ci-dessus (pushHistory + map
  // immuable) — verrouiller/déverrouiller est donc annulable au même titre
  // que n'importe quelle autre mutation. L'application concrète du
  // verrouillage (bloquer drag/resize/suppression...) se fait ailleurs
  // (canvas-stage.tsx, properties-panel.tsx, unlockedSelectedIds ci-dessus) —
  // cette action ne fait que persister le flag.
  setElementLocked: (id, locked) => set((state) => {
    const page = currentPage(state);
    const elements = page.elements.map((element) => (element.id === id ? ({ ...element, locked } as DocumentElement) : element));
    return { ...pushHistory(state), content: withPageElements(state.content, state.currentPageIndex, elements) };
  }),

  // L'ordre du tableau `elements` EST l'ordre de rendu Konva (dernier =
  // premier plan) — "monter" un élément le déplace donc vers la fin du
  // tableau, "descendre" vers le début, convention Figma/Illustrator.
  moveElementUp: (id) => set((state) => {
    const page = currentPage(state);
    const index = page.elements.findIndex((element) => element.id === id);
    if (index === -1 || index === page.elements.length - 1) return state;
    const elements = [...page.elements];
    [elements[index], elements[index + 1]] = [elements[index + 1], elements[index]];
    return { ...pushHistory(state), content: withPageElements(state.content, state.currentPageIndex, elements) };
  }),

  moveElementDown: (id) => set((state) => {
    const page = currentPage(state);
    const index = page.elements.findIndex((element) => element.id === id);
    if (index <= 0) return state;
    const elements = [...page.elements];
    [elements[index], elements[index - 1]] = [elements[index - 1], elements[index]];
    return { ...pushHistory(state), content: withPageElements(state.content, state.currentPageIndex, elements) };
  }),

  // Duplique toute la sélection en une seule action (un seul instantané
  // d'historique, comme un Smart Block) plutôt qu'un `addElement` par
  // élément — sinon un Ctrl+D sur 3 éléments pousserait 3 entrées
  // d'historique et un seul Ctrl+Z n'annulerait qu'un tiers de l'opération.
  duplicateSelected: () => set((state) => {
    const page = currentPage(state);
    const selectedIds = unlockedSelectedIds(page, state.selectedElementIds);
    const selected = page.elements.filter((element) => selectedIds.has(element.id));
    if (selected.length === 0) return state;
    const copies = selected.map((element) => ({ ...element, id: newElementIdForClone(element.type), x: element.x + 16, y: element.y + 16 }) as DocumentElement);
    return {
      ...pushHistory(state),
      content: withPageElements(state.content, state.currentPageIndex, [...page.elements, ...copies]),
      selectedElementIds: copies.map((copy) => copy.id),
    };
  }),

  removeSelected: () => set((state) => {
    const page = currentPage(state);
    const selectedIds = unlockedSelectedIds(page, state.selectedElementIds);
    if (selectedIds.size === 0) return state;
    const elements = page.elements.filter((element) => !selectedIds.has(element.id));
    return {
      ...pushHistory(state),
      content: withPageElements(state.content, state.currentPageIndex, elements),
      // Les éléments verrouillés (donc ignorés ci-dessus) restent sélectionnés
      // après coup, pas de désélection totale — cohérent avec le fait qu'ils
      // n'ont pas été touchés.
      selectedElementIds: state.selectedElementIds.filter((id) => !selectedIds.has(id)),
    };
  }),

  // Alignement (étape 14) — n'a de sens qu'à partir de 2 éléments
  // sélectionnés (voir alignment-toolbar.tsx, qui ne s'affiche que dans ce
  // cas). Un seul instantané d'historique pour tous les éléments déplacés.
  alignSelected: (edge) => set((state) => {
    const page = currentPage(state);
    const selectedIds = unlockedSelectedIds(page, state.selectedElementIds);
    const selected = page.elements.filter((element) => selectedIds.has(element.id));
    if (selected.length < 2) return state;

    const left = Math.min(...selected.map((element) => element.x));
    const right = Math.max(...selected.map((element) => element.x + element.width));
    const top = Math.min(...selected.map((element) => element.y));
    const bottom = Math.max(...selected.map((element) => element.y + element.height));

    function nextPosition(element: DocumentElement): Partial<DocumentElement> {
      switch (edge) {
        case "left": return { x: left };
        case "right": return { x: right - element.width };
        case "centerX": return { x: (left + right) / 2 - element.width / 2 };
        case "top": return { y: top };
        case "bottom": return { y: bottom - element.height };
        case "centerY": return { y: (top + bottom) / 2 - element.height / 2 };
      }
    }

    const elements = page.elements.map((element) => (selectedIds.has(element.id) ? ({ ...element, ...nextPosition(element) } as DocumentElement) : element));
    return { ...pushHistory(state), content: withPageElements(state.content, state.currentPageIndex, elements) };
  }),

  // Distribution à espacement égal (étape 14) — les éléments extrêmes (le
  // plus à gauche/haut et le plus à droite/bas) restent en place, seuls ceux
  // entre les deux sont repositionnés. N'a de sens qu'à partir de 3 éléments
  // (2 éléments n'ont qu'un seul intervalle, rien à égaliser).
  distributeSelected: (axis) => set((state) => {
    const page = currentPage(state);
    const selectedIds = unlockedSelectedIds(page, state.selectedElementIds);
    const selected = page.elements.filter((element) => selectedIds.has(element.id));
    if (selected.length < 3) return state;

    const sorted = [...selected].sort((a, b) => (axis === "horizontal" ? a.x - b.x : a.y - b.y));
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const totalSpan = axis === "horizontal" ? last.x + last.width - first.x : last.y + last.height - first.y;
    const totalSize = sorted.reduce((sum, element) => sum + (axis === "horizontal" ? element.width : element.height), 0);
    const gap = (totalSpan - totalSize) / (sorted.length - 1);

    const positions = new Map<string, number>();
    let cursor = axis === "horizontal" ? first.x : first.y;
    for (const element of sorted) {
      positions.set(element.id, cursor);
      cursor += (axis === "horizontal" ? element.width : element.height) + gap;
    }

    const elements = page.elements.map((element) => {
      const value = positions.get(element.id);
      if (value === undefined) return element;
      return axis === "horizontal" ? { ...element, x: value } : { ...element, y: value };
    });
    return { ...pushHistory(state), content: withPageElements(state.content, state.currentPageIndex, elements) };
  }),

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
      selectedElementIds: [],
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
      background: cloned.background,
    };
    const pages = [...state.content.pages.slice(0, index + 1), newPage, ...state.content.pages.slice(index + 1)];
    return {
      ...pushHistory(state),
      content: { ...state.content, pages },
      currentPageIndex: index + 1,
      selectedElementIds: [],
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
      selectedElementIds: [],
      editingTextId: null,
    };
  }),

  // Fond de page (étape 16) — couleur unie uniquement, voir content.ts.
  setPageBackground: (pageIndex, color) => set((state) => {
    const pages = state.content.pages.map((page, index) => (index === pageIndex ? { ...page, background: color ? { type: "color" as const, value: color } : undefined } : page));
    return { ...pushHistory(state), content: { ...state.content, pages } };
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
      selectedElementIds: [],
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
      selectedElementIds: [],
    };
  }),

  redo: () => set((state) => {
    const next = state.future[0];
    if (!next) return state;
    return {
      content: next,
      past: [...state.past, cloneContent(state.content)].slice(-MAX_HISTORY),
      future: state.future.slice(1),
      selectedElementIds: [],
    };
  }),
}));

// Sélection unique dérivée (étape 13) — `null` si aucune sélection ou si
// plusieurs éléments sont sélectionnés, pour les consommateurs qui n'ont de
// sens que sur un seul élément (Propriétés en mode simple, édition de texte).
export function useSelectedElementId(): string | null {
  return useDocumentStore((state) => (state.selectedElementIds.length === 1 ? state.selectedElementIds[0] : null));
}
