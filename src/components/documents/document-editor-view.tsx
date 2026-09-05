"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import { saveDocumentAction } from "@/lib/documents-actions";
import { notify } from "@/lib/notify";
import type { StudioDocumentDetail } from "@/data/documents";

type DocumentEditorViewProps = {
  document: StudioDocumentDetail;
};

type SaveState = "idle" | "saving" | "saved" | "error";

/**
 * Squelette de l'éditeur (Studio de documents, étape 1) — plein écran via un
 * overlay `fixed inset-0` plutôt qu'une restructuration du layout dashboard
 * partagé (DashboardSidebar/main), pour ne pas toucher au reste des pages :
 * z-[70] passe au-dessus de la sidebar (z-[60]) et de l'en-tête mobile (z-40).
 * Le canvas Konva/Tiptap réel arrive à l'étape 2 — pour l'instant seuls le
 * titre et le statut sont réellement modifiables.
 */
export function DocumentEditorView({ document }: DocumentEditorViewProps) {
  const [title, setTitle] = useState(document.title);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const readOnly = document.status === "Finalisé";

  async function handleTitleBlur() {
    if (readOnly || title.trim() === document.title) return;
    setSaveState("saving");
    const result = await saveDocumentAction(document.id, { title, content: document.content });
    if (!result.ok) {
      setSaveState("error");
      notify.error(result.error);
      return;
    }
    setSaveState("saved");
  }

  const saveLabel: Record<SaveState, string> = {
    idle: "",
    saving: "Enregistrement…",
    saved: "✓ Enregistré",
    error: "Échec de l’enregistrement",
  };

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

        {saveLabel[saveState] ? <span className="text-xs font-bold text-animeo-muted">{saveLabel[saveState]}</span> : null}
      </header>

      <div className="flex flex-1 items-center justify-center overflow-auto p-6">
        <div className="flex aspect-[210/297] w-full max-w-md flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-[#d9e5e2] bg-white text-center">
          <Icon name="document" className="h-10 w-10 text-animeo-muted" />
          <p className="max-w-[240px] text-sm font-bold text-animeo-dark">L’éditeur graphique arrive dans une prochaine étape.</p>
          <p className="max-w-[240px] text-xs text-animeo-muted">Pour l’instant, vous pouvez créer, renommer et supprimer des documents.</p>
        </div>
      </div>
    </div>
  );
}
