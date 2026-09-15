"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useCurrentUser } from "@/components/auth/current-user-provider";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { Icon } from "@/components/ui/icon";
import { hasPermission } from "@/lib/auth/permissions";
import { createDocumentAction, deleteDocumentAction } from "@/lib/documents-actions";
import { TemplateThumbnailSketch } from "@/components/documents/editor/template-thumbnail-sketch";
import { notify } from "@/lib/notify";
import type { DocumentPageSize } from "@/lib/documents/content";
import type { StudioDocumentSummary, StudioDocumentTemplateSummary } from "@/data/documents";

type DocumentsListProps = {
  documents: StudioDocumentSummary[];
  templates: StudioDocumentTemplateSummary[];
};

// Sélecteur de format (étape 26) — choisi à la création uniquement (pas de
// changement de format après coup, hors périmètre, voir le plan). Les
// modèles existants sont conçus pour A4 : choisir un format différent
// bascule automatiquement sur "Vierge" et masque la galerie de modèles
// (mise en page cassée sinon), voir handleFormatChange plus bas.
// Vignette (largeur/hauteur en px) précalculée pour tenir dans une boîte de
// 28×28 en conservant le ratio réel de chaque format (PAGE_DIMENSIONS,
// page-geometry.ts) — plus simple et plus fiable qu'un `aspect-ratio` CSS
// combiné à des contraintes max-width/max-height sur un élément vide.
const FORMAT_OPTIONS: { value: DocumentPageSize; label: string; swatch: { w: number; h: number } }[] = [
  { value: "A4_PORTRAIT", label: "Portrait (A4)", swatch: { w: 20, h: 28 } },
  { value: "A4_LANDSCAPE", label: "Paysage (A4)", swatch: { w: 28, h: 20 } },
  { value: "POSTER_A3_PORTRAIT", label: "Affiche (A3)", swatch: { w: 20, h: 28 } },
  { value: "SOCIAL_SQUARE", label: "Post Instagram carré", swatch: { w: 28, h: 28 } },
  { value: "SOCIAL_PORTRAIT", label: "Post Instagram portrait", swatch: { w: 22, h: 28 } },
];

export function DocumentsList({ documents, templates }: DocumentsListProps) {
  const router = useRouter();
  const currentUser = useCurrentUser();
  const canDelete = hasPermission(currentUser, "MANAGE_DOCUMENTS");

  const [localDocuments, setLocalDocuments] = useState(documents);
  const [previousDocuments, setPreviousDocuments] = useState(documents);
  if (documents !== previousDocuments) {
    setPreviousDocuments(documents);
    setLocalDocuments(documents);
  }

  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState<DocumentPageSize>("A4_PORTRAIT");
  const [savingNew, setSavingNew] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<StudioDocumentSummary | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function openCreate() {
    setSelectedTemplateId(null);
    setPageSize("A4_PORTRAIT");
    setCreating(true);
  }

  // Les modèles sont tous conçus pour A4_PORTRAIT — un format différent
  // rendrait leur mise en page cassée, donc on retombe sur "Vierge" dès que
  // le format choisi s'en écarte.
  function handleFormatChange(value: DocumentPageSize) {
    setPageSize(value);
    if (value !== "A4_PORTRAIT") setSelectedTemplateId(null);
  }

  async function createDocument() {
    setSavingNew(true);
    const result = await createDocumentAction({
      title: newTitle.trim() || "Document sans titre",
      templateId: selectedTemplateId ?? undefined,
      pageSize,
    });
    setSavingNew(false);
    if (!result.ok) {
      notify.error(result.error);
      return;
    }
    setCreating(false);
    setNewTitle("");
    router.push(`/dashboard/documents/${result.id}`);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeletingId(deleteTarget.id);
    const result = await deleteDocumentAction(deleteTarget.id);
    setDeletingId(null);
    if (!result.ok) {
      notify.error(result.error);
      setDeleteTarget(null);
      return;
    }
    setLocalDocuments((current) => current.filter((doc) => doc.id !== deleteTarget.id));
    notify.success("Document supprimé.");
    setDeleteTarget(null);
  }

  return (
    <>
      <PageHeader
        title="Documents"
        description="Comptes rendus de consultation et documents professionnels."
        action={
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center rounded-2xl bg-animeo px-5 py-3 font-extrabold text-white shadow-[0_8px_20px_color-mix(in_srgb,var(--theme-brand)_20%,transparent)] transition hover:-translate-y-0.5 hover:bg-animeo-hover"
          >
            <span aria-hidden="true" className="mr-2 text-xl leading-none">+</span>
            Nouveau document
          </button>
        }
      />

      {localDocuments.length === 0 ? (
        <Card className="px-6 py-16 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-animeo-soft text-animeo-dark">
            <Icon name="document" className="h-7 w-7" />
          </div>
          <h3 className="mt-4 font-extrabold text-animeo-dark">Aucun document pour l’instant</h3>
          <p className="mt-1 text-sm text-animeo-muted">Créez votre premier compte rendu de consultation.</p>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {localDocuments.map((document) => (
            <Card key={document.id} className={`overflow-hidden transition ${deletingId === document.id ? "opacity-50" : ""}`}>
              <button type="button" onClick={() => router.push(`/dashboard/documents/${document.id}`)} className="block w-full text-left">
                <div className="flex aspect-[210/297] items-center justify-center bg-animeo-bg">
                  {document.thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element -- data URI, jamais optimisable par next/image.
                    <img src={document.thumbnail} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <Icon name="document" className="h-10 w-10 text-animeo-muted" />
                  )}
                </div>
                <div className="p-4">
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.06em] ${document.status === "Finalisé" ? "bg-animeo-positive-soft text-animeo-hover" : "bg-animeo-warning-soft text-animeo-warning"}`}>
                      {document.status}
                    </span>
                  </div>
                  <p className="mt-2 truncate font-extrabold text-animeo-dark">{document.title}</p>
                  <p className="mt-0.5 truncate text-xs font-semibold text-animeo-muted">
                    {document.animalName ?? document.clientName ?? "Sans fiche liée"} · {document.updatedAt}
                  </p>
                </div>
              </button>
              {canDelete ? (
                <div className="flex justify-end border-t border-animeo-border-soft px-3 py-2">
                  <button type="button" onClick={() => setDeleteTarget(document)} disabled={deletingId === document.id} className="rounded-lg px-2.5 py-1.5 text-xs font-extrabold text-animeo-error transition hover:bg-animeo-danger-soft disabled:opacity-50">
                    Supprimer
                  </button>
                </div>
              ) : null}
            </Card>
          ))}
        </div>
      )}

      {creating ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-animeo-deep/60 p-4 backdrop-blur-sm" role="presentation">
          <section role="dialog" aria-modal="true" aria-labelledby="new-document-title" className="w-full max-w-2xl rounded-[18px] bg-white p-6 shadow-[0_24px_70px_rgb(var(--theme-shadow-rgb)/0.3)]">
            <h2 id="new-document-title" className="text-lg font-black text-animeo-dark">Nouveau document</h2>
            <label className="mt-4 block max-w-sm">
              <span className="mb-1.5 block text-xs font-extrabold uppercase tracking-[0.08em] text-animeo-muted">Titre</span>
              <input
                autoFocus
                value={newTitle}
                onChange={(event) => setNewTitle(event.target.value)}
                placeholder="Ex. Compte rendu — Oslo"
                className="h-11 w-full rounded-xl border border-animeo-border bg-animeo-bg px-3.5 text-sm font-semibold text-animeo-dark outline-none focus:border-animeo focus:bg-white"
              />
            </label>
            <fieldset className="mt-5">
              <legend className="mb-2 block text-xs font-extrabold uppercase tracking-[0.08em] text-animeo-muted">Format</legend>
              <div className="flex flex-wrap gap-2">
                {FORMAT_OPTIONS.map((format) => (
                  <button
                    key={format.value}
                    type="button"
                    onClick={() => handleFormatChange(format.value)}
                    aria-pressed={pageSize === format.value}
                    className={`flex items-center gap-2 rounded-xl border-2 px-2.5 py-2 text-left transition ${
                      pageSize === format.value ? "border-animeo bg-animeo-soft" : "border-animeo-border-soft hover:border-animeo/50"
                    }`}
                  >
                    <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center">
                      <span className="block border border-animeo-muted bg-white" style={{ width: format.swatch.w, height: format.swatch.h }} />
                    </span>
                    <span className="text-xs font-extrabold text-animeo-dark">{format.label}</span>
                  </button>
                ))}
              </div>
            </fieldset>

            {templates.length > 0 && pageSize === "A4_PORTRAIT" ? (
              <fieldset className="mt-5">
                <legend className="mb-2 block text-xs font-extrabold uppercase tracking-[0.08em] text-animeo-muted">Modèle</legend>
                <div className="grid max-h-96 grid-cols-2 gap-3 overflow-y-auto pr-1 sm:grid-cols-3">
                  <button
                    type="button"
                    onClick={() => setSelectedTemplateId(null)}
                    aria-pressed={selectedTemplateId === null}
                    className={`overflow-hidden rounded-xl border-2 text-left transition ${
                      selectedTemplateId === null ? "border-animeo" : "border-animeo-border-soft hover:border-animeo/50"
                    }`}
                  >
                    <div className="flex items-center justify-center bg-animeo-bg" style={{ aspectRatio: "794 / 1123" }}>
                      <Icon name="document" className="h-6 w-6 text-animeo-muted" />
                    </div>
                    <p className="px-2.5 py-2 text-xs font-extrabold text-animeo-dark">Vierge</p>
                  </button>
                  {templates.map((template) => (
                    <button
                      key={template.id}
                      type="button"
                      onClick={() => setSelectedTemplateId(template.id)}
                      aria-pressed={selectedTemplateId === template.id}
                      className={`overflow-hidden rounded-xl border-2 text-left transition ${
                        selectedTemplateId === template.id ? "border-animeo" : "border-animeo-border-soft hover:border-animeo/50"
                      }`}
                    >
                      <TemplateThumbnailSketch layoutSketch={template.layoutSketch} />
                      <div className="px-2.5 py-2">
                        <p className="truncate text-xs font-extrabold text-animeo-dark">{template.name}</p>
                        {template.species ? (
                          <span className="mt-1 inline-block rounded-full bg-animeo-bg px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-animeo-muted">{template.species}</span>
                        ) : null}
                      </div>
                    </button>
                  ))}
                </div>
              </fieldset>
            ) : null}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setCreating(false)} className="rounded-xl border border-animeo-border px-4 py-2.5 text-sm font-extrabold text-animeo-dark transition hover:bg-animeo-bg">
                Annuler
              </button>
              <button type="button" onClick={createDocument} disabled={savingNew} className="rounded-xl bg-animeo px-4 py-2.5 text-sm font-extrabold text-white transition hover:bg-animeo-hover disabled:cursor-not-allowed disabled:opacity-60">
                {savingNew ? "Création…" : "Créer"}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {deleteTarget ? (
        <ConfirmModal
          title="Supprimer ce document ?"
          message={`« ${deleteTarget.title} » sera définitivement supprimé. Cette action est irréversible.`}
          confirmLabel="Supprimer"
          onConfirm={confirmDelete}
          onClose={() => setDeleteTarget(null)}
        />
      ) : null}
    </>
  );
}
