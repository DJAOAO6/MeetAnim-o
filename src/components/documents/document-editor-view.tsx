"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toPng } from "html-to-image";
import { jsPDF } from "jspdf";
import type Konva from "konva";
import { EditorToolbar } from "@/components/documents/editor/editor-toolbar";
import { PropertiesPanel } from "@/components/documents/editor/properties-panel";
import { TextOverlay } from "@/components/documents/editor/text-overlay";
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
  const duplicateSelected = useDocumentStore((state) => state.duplicateSelected);
  const removeSelected = useDocumentStore((state) => state.removeSelected);
  const editingTextId = useDocumentStore((state) => state.editingTextId);
  const selectElement = useDocumentStore((state) => state.selectElement);
  const setEditingText = useDocumentStore((state) => state.setEditingText);
  const setPlacingMarkerPreset = useDocumentStore((state) => state.setPlacingMarkerPreset);

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
   * Export PDF V1 (étape 5) : rendu client, image par page — le Stage Konva
   * (formes/images/schéma) et la surcouche DOM (texte réel) sont capturés
   * séparément puis composés (export-pdf.ts), voir le plan pour le choix et
   * ses limites (texte rasterisé, pas sélectionnable — export vectoriel
   * hors périmètre Phase 1). Efface sélection/édition/pose de repère avant
   * la capture pour ne jamais figer un état d'interaction dans le PDF.
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
    try {
      selectElement(null);
      setEditingText(null);
      setPlacingMarkerPreset(null);
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

      const pixelRatio = 2;
      const stageDataUrl = stage.toDataURL({ pixelRatio, mimeType: "image/png" });
      const overlayDataUrl = await toPng(overlay, { pixelRatio, width, height, backgroundColor: "transparent" });
      const pageImage = await compositeDocumentPageImage(stageDataUrl, overlayDataUrl, width * pixelRatio, height * pixelRatio);

      const pdf = new jsPDF({ unit: "px", format: [width, height] });
      pdf.addImage(pageImage, "JPEG", 0, 0, width, height);
      const pdfBase64 = pdf.output("datauristring");
      const thumbnail = await downscaleImage(pageImage, 320);

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
      setFinalizing(false);
    }
  }

  // Raccourcis clavier essentiels (§26 du prompt) — jamais actifs pendant la
  // frappe dans un bloc de texte (Ctrl+D y supprimerait un mot, pas dupliquer
  // l'élément) ni en lecture seule.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (readOnly || editingTextId) return;
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
    <div className="fixed inset-0 z-[70] flex flex-col bg-animeo-bg">
      <header className="flex flex-wrap items-center gap-3 border-b border-[#dce8e5] bg-white px-4 py-3 sm:px-6">
        <Link href="/dashboard/documents" className="flex items-center gap-1.5 text-sm font-extrabold text-animeo-muted transition hover:text-animeo-dark">
          <Icon name="arrow" className="h-4 w-4 rotate-180" />
          Retour
        </Link>

        <input
          aria-label="Titre du document"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onBlur={handleTitleBlur}
          disabled={readOnly}
          className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1 text-base font-black text-animeo-dark outline-none transition hover:border-[#d9e5e2] focus:border-animeo focus:bg-animeo-bg disabled:hover:border-transparent"
        />

        <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.06em] ${document.status === "Finalisé" ? "bg-[#e4f5ef] text-[#267668]" : "bg-[#fff1d5] text-[#986216]"}`}>
          {document.status}
        </span>

        {!previewMode && saveLabel[saveState] ? <span className="text-xs font-bold text-animeo-muted">{saveLabel[saveState]}</span> : null}

        <div className="ml-auto flex gap-2">
          <button type="button" onClick={() => setPreviewMode((current) => !current)} className="rounded-xl border border-[#d4e2df] px-4 py-2 text-sm font-extrabold text-animeo-dark transition hover:bg-animeo-bg">
            {previewMode ? "Reprendre l’édition" : "Aperçu"}
          </button>
          <button
            type="button"
            disabled={readOnly || finalizing}
            onClick={() => setConfirmFinalize(true)}
            className="rounded-xl bg-animeo px-4 py-2 text-sm font-extrabold text-white transition hover:bg-[#459e90] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {finalizing ? "Finalisation…" : "Finaliser"}
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {!previewMode ? <EditorToolbar readOnly={readOnly} /> : null}

        {/* items-start (jamais items-center) : une page A4 (1123px) dépasse
            presque toujours la hauteur de la fenêtre — centrer verticalement
            un enfant plus grand que son conteneur pousse la moitié du
            contenu en overflow négatif, inaccessible au défilement (bug
            classique flex + overflow-auto). Aligné en haut, comme n'importe
            quel document qu'on lit de haut en bas. */}
        <div className="flex flex-1 items-start justify-center overflow-auto p-6">
          <div className="relative" style={{ width, height }}>
            <CanvasStage readOnly={readOnly} stageRef={stageRef} />
            <div ref={overlayRef} className="pointer-events-none absolute inset-0">
              <TextOverlay readOnly={readOnly} />
            </div>
          </div>
        </div>

        {!previewMode ? <PropertiesPanel readOnly={readOnly} /> : null}
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
