"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toPng } from "html-to-image";
import { jsPDF } from "jspdf";
import type Konva from "konva";
import { StudioSidebar } from "@/components/documents/editor/studio-sidebar";
import { InspectorTabs } from "@/components/documents/editor/inspector-tabs";
import { TextOverlay } from "@/components/documents/editor/text-overlay";
import { AlignmentToolbar } from "@/components/documents/editor/alignment-toolbar";
import { SelectionLockBadge } from "@/components/documents/editor/selection-lock-badge";
import { ZoomControl } from "@/components/documents/editor/zoom-control";
import { PagesFooterBar } from "@/components/documents/editor/pages-footer-bar";
import { useDocumentStore } from "@/components/documents/editor/document-store";
import { PAGE_DIMENSIONS } from "@/components/documents/editor/page-geometry";
import { compositeDocumentPageImage, downscaleImage } from "@/components/documents/editor/export-pdf";
import { Icon } from "@/components/ui/icon";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { finalizeDocumentAction, saveDocumentAction } from "@/lib/documents-actions";
import { notify } from "@/lib/notify";
import type { StudioDocumentDetail } from "@/data/documents";

// Konva a besoin de `window` — jamais rendu côté serveur, même convention
// que RealMap/TourRunMap (dynamic + ssr:false).
const CanvasStage = dynamic(() => import("@/components/documents/editor/canvas-stage").then((mod) => mod.CanvasStage), {
  ssr: false,
  loading: () => <div className="flex h-full w-full items-center justify-center text-sm font-bold text-animeo-muted">Chargement de l’éditeur…</div>,
});

type DocumentEditorViewProps = {
  document: StudioDocumentDetail;
};

type SaveState = "idle" | "saving" | "saved" | "error";
const AUTOSAVE_DELAY_MS = 2000;

export function DocumentEditorView({ document }: DocumentEditorViewProps) {
  const router = useRouter();
  const [title, setTitle] = useState(document.title);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [previewMode, setPreviewMode] = useState(false);
  const [confirmFinalize, setConfirmFinalize] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const readOnly = document.status === "Finalisé" || previewMode;

  const loadContent = useDocumentStore((state) => state.loadContent);
  const content = useDocumentStore((state) => state.content);
  const undo = useDocumentStore((state) => state.undo);
  const redo = useDocumentStore((state) => state.redo);
  // Sélecteurs ciblés (juste le booléen, pas tout le tableau) — le bouton
  // ne se re-rend qu'au moment où il devient (in)disponible, pas à chaque
  // action historisée.
  const canUndo = useDocumentStore((state) => state.past.length > 0);
  const canRedo = useDocumentStore((state) => state.future.length > 0);
  const duplicateSelected = useDocumentStore((state) => state.duplicateSelected);
  const removeSelected = useDocumentStore((state) => state.removeSelected);
  const editingTextId = useDocumentStore((state) => state.editingTextId);
  const selectElement = useDocumentStore((state) => state.selectElement);
  const setEditingText = useDocumentStore((state) => state.setEditingText);
  const setPlacingMarkerPreset = useDocumentStore((state) => state.setPlacingMarkerPreset);
  const zoomLevel = useDocumentStore((state) => state.zoomLevel);
  const setZoom = useDocumentStore((state) => state.setZoom);
  const currentPageIndex = useDocumentStore((state) => state.currentPageIndex);
  const setCurrentPageIndex = useDocumentStore((state) => state.setCurrentPageIndex);

  const stageRef = useRef<Konva.Stage>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Charge le contenu serveur dans le store une seule fois au montage — pas
  // à chaque rendu, sinon toute frappe locale serait écrasée par la prop.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadContent(document.content, document.variableContext, document.markerPresets); }, [document.id]);

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipNextAutosaveRef = useRef(true);

  useEffect(() => {
    if (readOnly) return;
    if (skipNextAutosaveRef.current) {
      // Le premier passage suit loadContent() ci-dessus — pas une vraie
      // modification, ne déclenche jamais d'appel serveur immédiat.
      skipNextAutosaveRef.current = false;
      return;
    }
    setSaveState("saving");
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      const result = await saveDocumentAction(document.id, { content });
      setSaveState(result.ok ? "saved" : "error");
      if (!result.ok) notify.error(result.error);
    }, AUTOSAVE_DELAY_MS);
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, readOnly]);

  async function handleTitleBlur() {
    if (readOnly || title.trim() === document.title) return;
    setSaveState("saving");
    const result = await saveDocumentAction(document.id, { title, content });
    setSaveState(result.ok ? "saved" : "error");
    if (!result.ok) notify.error(result.error);
  }

  /**
   * Export PDF V1 (étapes 5 et 10) : rendu client, image par page — le
   * Stage Konva (formes/images/schéma) et la surcouche DOM (texte réel)
   * sont capturés séparément puis composés (export-pdf.ts), voir le plan
   * pour le choix et ses limites (texte rasterisé, pas sélectionnable —
   * export vectoriel hors périmètre Phase 1). Efface sélection/édition/pose
   * de repère avant la capture pour ne jamais figer un état d'interaction
   * dans le PDF. Le zoom est forcé à 100 % pendant l'export : `stage.toDataURL()`
   * est toujours en résolution native (indépendant de toute transformation
   * CSS), mais la capture DOM de la surcouche texte (html-to-image) hérite,
   * elle, du `transform: scale()` d'un ancêtre — sans ce reset, les deux
   * couches composées ne correspondraient plus si le zoom n'était pas à 100 %
   * au moment de finaliser. Boucle sur toutes les pages du document : sans
   * ça, le contenu des pages 2+ serait silencieusement absent du PDF final.
   */
  async function handleFinalize() {
    setConfirmFinalize(false);
    if (readOnly || finalizing) return;
    const stage = stageRef.current;
    const overlay = overlayRef.current;
    if (!stage || !overlay) {
      notify.error("L’éditeur n’est pas encore prêt, réessayez dans un instant.");
      return;
    }

    setFinalizing(true);
    const originalPageIndex = currentPageIndex;
    try {
      selectElement(null);
      setEditingText(null);
      setPlacingMarkerPreset(null);
      setZoom(1);
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

      const pixelRatio = 2;
      let pdf: jsPDF | null = null;
      let thumbnail = "";
      for (let pageIndex = 0; pageIndex < content.pages.length; pageIndex += 1) {
        setCurrentPageIndex(pageIndex);
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

        const stageDataUrl = stage.toDataURL({ pixelRatio, mimeType: "image/png" });
        const overlayDataUrl = await toPng(overlay, { pixelRatio, width, height, backgroundColor: "transparent" });
        const pageImage = await compositeDocumentPageImage(stageDataUrl, overlayDataUrl, width * pixelRatio, height * pixelRatio);

        if (!pdf) {
          pdf = new jsPDF({ unit: "px", format: [width, height] });
        } else {
          pdf.addPage([width, height], "portrait");
        }
        pdf.addImage(pageImage, "JPEG", 0, 0, width, height);
        if (pageIndex === 0) thumbnail = await downscaleImage(pageImage, 320);
      }

      const pdfBase64 = pdf!.output("datauristring");
      const result = await finalizeDocumentAction(document.id, { pdfBase64, thumbnail });
      if (!result.ok) {
        notify.error(result.error);
        return;
      }
      notify.success("Document finalisé.");
      router.refresh();
    } catch {
      notify.error("Impossible de générer le PDF. Réessayez.");
    } finally {
      setCurrentPageIndex(originalPageIndex);
      setFinalizing(false);
    }
  }

  // Raccourcis clavier essentiels (§26 du prompt) — jamais actifs pendant la
  // frappe dans un bloc de texte (Ctrl+D y supprimerait un mot, pas dupliquer
  // l'élément) ni en lecture seule. Également jamais actifs quand le focus
  // est dans un CHAMP DE FORMULAIRE quelconque (titre du document, champ Hex
  // du ColorPicker, recherche d'icône/police...) — sans cette vérification,
  // corriger une faute de frappe dans le titre avec Retour arrière
  // supprimait aussi l'élément sélectionné sur le canevas ET bloquait le
  // retour arrière réel dans le champ (event.preventDefault()), un vrai bug
  // signalé par l'utilisateur.
  useEffect(() => {
    function isTypingInFormField(target: EventTarget | null): boolean {
      if (!(target instanceof HTMLElement)) return false;
      return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (readOnly || editingTextId || isTypingInFormField(event.target)) return;
      const meta = event.ctrlKey || event.metaKey;
      if (meta && event.key.toLowerCase() === "z" && event.shiftKey) {
        event.preventDefault();
        redo();
      } else if (meta && event.key.toLowerCase() === "z") {
        event.preventDefault();
        undo();
      } else if (meta && event.key.toLowerCase() === "d") {
        event.preventDefault();
        duplicateSelected();
      } else if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        removeSelected();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [readOnly, editingTextId, undo, redo, duplicateSelected, removeSelected]);

  const saveLabel: Record<SaveState, string> = {
    idle: "",
    saving: "Enregistrement…",
    saved: "✓ Enregistré",
    error: "Échec de l’enregistrement",
  };

  const { width, height } = PAGE_DIMENSIONS[content.pageSize];

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-neutral-100">
      <header className="flex flex-wrap items-center gap-3 border-b border-neutral-200 bg-white px-4 py-2.5 sm:px-5">
        <Link href="/dashboard/documents" className="flex items-center gap-1.5 text-sm font-semibold text-neutral-500 transition hover:text-neutral-800">
          <Icon name="arrow" className="h-4 w-4 rotate-180" />
          Retour
        </Link>

        {!previewMode ? (
          <div className="flex items-center gap-0.5 border-l border-neutral-200 pl-3">
            <button
              type="button"
              aria-label="Annuler"
              title="Annuler (Ctrl+Z)"
              disabled={readOnly || !canUndo}
              onClick={() => undo()}
              className="flex h-8 w-8 items-center justify-center rounded-md text-neutral-600 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <UndoIcon />
            </button>
            <button
              type="button"
              aria-label="Rétablir"
              title="Rétablir (Ctrl+Maj+Z)"
              disabled={readOnly || !canRedo}
              onClick={() => redo()}
              className="flex h-8 w-8 items-center justify-center rounded-md text-neutral-600 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <RedoIcon />
            </button>
          </div>
        ) : null}

        <input
          aria-label="Titre du document"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onBlur={handleTitleBlur}
          disabled={readOnly}
          className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 py-1 text-base font-bold text-neutral-800 outline-none transition hover:border-neutral-200 focus:border-animeo focus:bg-neutral-50 disabled:hover:border-transparent"
        />

        <span className={`inline-flex rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${document.status === "Finalisé" ? "bg-[#e4f5ef] text-[#267668]" : "bg-[#fff1d5] text-[#986216]"}`}>
          {document.status}
        </span>

        {!previewMode && saveLabel[saveState] ? <span className="text-xs font-semibold text-neutral-500">{saveLabel[saveState]}</span> : null}

        <div className="ml-auto flex gap-2">
          <button type="button" onClick={() => setPreviewMode((current) => !current)} className="rounded-md border border-neutral-200 px-3.5 py-2 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-50">
            {previewMode ? "Reprendre l’édition" : "Aperçu"}
          </button>
          <button
            type="button"
            disabled={readOnly || finalizing}
            onClick={() => setConfirmFinalize(true)}
            className="rounded-md bg-animeo px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-[#459e90] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {finalizing ? "Finalisation…" : "Finaliser"}
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {!previewMode ? <StudioSidebar readOnly={readOnly} /> : null}

        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Conteneur non défilant : ancre le zoom (bas-droite) à un point fixe
              du viewport, indépendant du défilement du canevas en dessous. */}
          <div className="relative flex-1 overflow-hidden">
            {/* items-start (jamais items-center) : une page A4 (1123px) dépasse
                presque toujours la hauteur de la fenêtre — centrer verticalement
                un enfant plus grand que son conteneur pousse la moitié du
                contenu en overflow négatif, inaccessible au défilement (bug
                classique flex + overflow-auto). Aligné en haut, comme n'importe
                quel document qu'on lit de haut en bas. */}
            <div className="absolute inset-0 flex items-start justify-center overflow-auto p-8">
              {/* Conteneur "de taille" : ses dimensions réelles (mises à
                  l'échelle du zoom) pilotent les bornes de défilement — un
                  `transform: scale()` seul ne change pas la boîte de mise en
                  page de son conteneur, voir le plan. */}
              <div style={{ width: width * zoomLevel, height: height * zoomLevel }}>
                <div className="relative" style={{ width, height, transform: `scale(${zoomLevel})`, transformOrigin: "top left" }}>
                  <CanvasStage readOnly={readOnly} stageRef={stageRef} />
                  <div ref={overlayRef} className="pointer-events-none absolute inset-0">
                    <TextOverlay readOnly={readOnly} />
                  </div>
                  {/* Hors de overlayRef volontairement : ce div est capturé tel quel
                      par l'export PDF (html-to-image), la barre d'alignement ne
                      doit jamais pouvoir s'y retrouver, même par accident de timing. */}
                  {!previewMode ? <AlignmentToolbar readOnly={readOnly} /> : null}
                  {!previewMode ? <SelectionLockBadge readOnly={readOnly} /> : null}
                </div>
              </div>
            </div>
            <ZoomControl />
          </div>

          {!previewMode ? <PagesFooterBar readOnly={readOnly || finalizing} /> : null}
        </div>

        {!previewMode ? <InspectorTabs readOnly={readOnly} /> : null}
      </div>

      {confirmFinalize ? (
        <ConfirmModal
          title="Finaliser ce document ?"
          message="Le document sera verrouillé : plus aucune modification directe. Pour le corriger ensuite, vous devrez le dupliquer."
          confirmLabel="Finaliser"
          destructive={false}
          onConfirm={handleFinalize}
          onClose={() => setConfirmFinalize(false)}
        />
      ) : null}
    </div>
  );
}

function UndoIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v0a5.5 5.5 0 0 1-5.5 5.5H11" />
    </svg>
  );
}

function RedoIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M15 14l5-5-5-5" />
      <path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5v0A5.5 5.5 0 0 0 9.5 20H13" />
    </svg>
  );
}
