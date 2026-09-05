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
import { notify } from "@/lib/notify";
import type { StudioDocumentSummary, StudioDocumentTemplateSummary } from "@/data/documents";

type DocumentsListProps = {
  documents: StudioDocumentSummary[];
  templates: StudioDocumentTemplateSummary[];
};

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
  const [savingNew, setSavingNew] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<StudioDocumentSummary | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function openCreate() {
    setSelectedTemplateId(null);
    setCreating(true);
  }

  async function createDocument() {
    setSavingNew(true);
    const result = await createDocumentAction({
      title: newTitle.trim() || "Document sans titre",
      templateId: selectedTemplateId ?? undefined,
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
            className="inline-flex items-center rounded-2xl bg-animeo px-5 py-3 font-extrabold text-white shadow-[0_8px_20px_rgba(79,175,159,0.2)] transition hover:-translate-y-0.5 hover:bg-[#459e90]"
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
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.06em] ${document.status === "Finalisé" ? "bg-[#e4f5ef] text-[#267668]" : "bg-[#fff1d5] text-[#986216]"}`}>
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
                <div className="flex justify-end border-t border-[#edf2f0] px-3 py-2">
                  <button type="button" onClick={() => setDeleteTarget(document)} disabled={deletingId === document.id} className="rounded-lg px-2.5 py-1.5 text-xs font-extrabold text-animeo-error transition hover:bg-[#ffe4e4] disabled:opacity-50">
                    Supprimer
                  </button>
                </div>
              ) : null}
            </Card>
          ))}
        </div>
      )}

      {creating ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#102f37]/60 p-4 backdrop-blur-sm" role="presentation">
          <section role="dialog" aria-modal="true" aria-labelledby="new-document-title" className="w-full max-w-md rounded-[18px] bg-white p-6 shadow-[0_24px_70px_rgba(12,39,47,0.3)]">
            <h2 id="new-document-title" className="text-lg font-black text-animeo-dark">Nouveau document</h2>
            <label className="mt-4 block">
              <span className="mb-1.5 block text-xs font-extrabold uppercase tracking-[0.08em] text-animeo-muted">Titre</span>
              <input
                autoFocus
                value={newTitle}
                onChange={(event) => setNewTitle(event.target.value)}
                placeholder="Ex. Compte rendu — Oslo"
                className="h-11 w-full rounded-xl border border-[#d9e5e2] bg-animeo-bg px-3.5 text-sm font-semibold text-animeo-dark outline-none focus:border-animeo focus:bg-white"
              />
            </label>
            {templates.length > 0 ? (
              <fieldset className="mt-4">
                <legend className="mb-1.5 block text-xs font-extrabold uppercase tracking-[0.08em] text-animeo-muted">Modèle</legend>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedTemplateId(null)}
                    aria-pressed={selectedTemplateId === null}
                    className={`rounded-xl border px-3.5 py-2.5 text-left text-sm font-extrabold transition ${
                      selectedTemplateId === null
                        ? "border-animeo bg-animeo-soft text-animeo-dark"
                        : "border-[#d9e5e2] bg-animeo-bg text-animeo-dark hover:border-animeo"
                    }`}
                  >
                    Vierge
                  </button>
                  {templates.map((template) => (
                    <button
                      key={template.id}
                      type="button"
                      onClick={() => setSelectedTemplateId(template.id)}
                      aria-pressed={selectedTemplateId === template.id}
                      className={`rounded-xl border px-3.5 py-2.5 text-left text-sm font-extrabold transition ${
                        selectedTemplateId === template.id
                          ? "border-animeo bg-animeo-soft text-animeo-dark"
                          : "border-[#d9e5e2] bg-animeo-bg text-animeo-dark hover:border-animeo"
                      }`}
                    >
                      {template.name}
                    </button>
                  ))}
                </div>
              </fieldset>
            ) : null}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setCreating(false)} className="rounded-xl border border-[#d4e2df] px-4 py-2.5 text-sm font-extrabold text-animeo-dark transition hover:bg-animeo-bg">
                Annuler
              </button>
              <button type="button" onClick={createDocument} disabled={savingNew} className="rounded-xl bg-animeo px-4 py-2.5 text-sm font-extrabold text-white transition hover:bg-[#459e90] disabled:cursor-not-allowed disabled:opacity-60">
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
