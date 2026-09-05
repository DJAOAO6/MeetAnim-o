import { create } from "zustand";
import type { DocumentContent, DocumentElement } from "@/lib/documents/content";
import type { DocumentVariableContext } from "@/lib/documents/variables";

const MAX_HISTORY = 50;

const EMPTY_VARIABLE_CONTEXT: DocumentVariableContext = { professional: null, client: null, animal: null, appointment: null };

type DocumentStoreState = {
  content: DocumentContent;
  variableContext: DocumentVariableContext;
  currentPageIndex: number;
  selectedElementId: string | null;
  // Distinct de la sélection : un texte peut être sélectionné (déplaçable,
  // redimensionnable) sans être en cours de frappe — seul un double-clic
  // bascule ici, voir text-overlay.tsx.
  editingTextId: string | null;
  // Pile d'annulation/rétablissement par snapshot complet du contenu — le
  // plus simple à raisonner correctement pour cette étape (pas de patchs
  // différentiels), amplement suffisant vu la taille d'un document.
  past: DocumentContent[];
  future: DocumentContent[];

  loadContent: (content: DocumentContent, variableContext?: DocumentVariableContext) => void;
  setCurrentPageIndex: (index: number) => void;
  selectElement: (id: string | null) => void;
  setEditingText: (id: string | null) => void;
  addElement: (element: DocumentElement) => void;
  addElements: (elements: DocumentElement[]) => void;
  updateElement: (id: string, patch: Partial<DocumentElement>) => void;
  removeElement: (id: string) => void;
  duplicateSelected: () => void;
  removeSelected: () => void;
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
  currentPageIndex: 0,
  selectedElementId: null,
  editingTextId: null,
  past: [],
  future: [],

  loadContent: (content, variableContext) => set({ content, variableContext: variableContext ?? EMPTY_VARIABLE_CONTEXT, currentPageIndex: 0, selectedElementId: null, editingTextId: null, past: [], future: [] }),

  setCurrentPageIndex: (index) => set({ currentPageIndex: index, selectedElementId: null, editingTextId: null }),

  selectElement: (id) => set({ selectedElementId: id }),

  setEditingText: (id) => set((state) => ({ editingTextId: id, selectedElementId: id ?? state.selectedElementId })),

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
