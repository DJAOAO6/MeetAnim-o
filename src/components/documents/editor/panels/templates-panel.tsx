"use client";

import { useEffect, useState } from "react";
import { useDocumentStore } from "@/components/documents/editor/document-store";
import { StudioPanel, StudioSectionLabel } from "@/components/documents/editor/studio-chrome";
import { TemplateThumbnailSketch } from "@/components/documents/editor/template-thumbnail-sketch";
import { newElementId } from "@/components/documents/editor/element-factory";
import { getDocumentTemplateContent, getDocumentTemplates } from "@/lib/documents-actions";
import type { StudioDocumentTemplateSummary } from "@/data/documents";

/**
 * Catégorie "Modèles" du rail (étape 10) — parcourt les modèles 1002 Pattes et
 * insère le choisi comme une NOUVELLE page (jamais un remplacement de la
 * page actuelle, destructif et surprenant). Récupère la liste au montage
 * (uniquement quand ce panneau est ouvert, pas à chaque chargement de
 * l'éditeur) — seule section du Studio à faire ainsi, comme la section
 * "Comptes rendus" de la fiche animal : la donnée est propre à ce panneau,
 * pas déjà chargée côté serveur pour la route éditeur.
 */
export function TemplatesPanel({ readOnly }: { readOnly: boolean }) {
  const [templates, setTemplates] = useState<StudioDocumentTemplateSummary[] | null>(null);
  const [insertingId, setInsertingId] = useState<string | null>(null);
  const insertPageFromTemplate = useDocumentStore((state) => state.insertPageFromTemplate);

  useEffect(() => {
    let cancelled = false;
    getDocumentTemplates().then((result) => {
      if (!cancelled) setTemplates(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function insertAsNewPage(template: StudioDocumentTemplateSummary) {
    setInsertingId(template.id);
    const content = await getDocumentTemplateContent(template.id);
    setInsertingId(null);
    const sourcePage = content?.pages[0];
    if (!sourcePage) return;
    const elements = sourcePage.elements.map((element) => ({ ...element, id: newElementId(element.type) }));
    insertPageFromTemplate(elements);
  }

  return (
    <StudioPanel id="studio-panel-templates" title="Modèles">
      <div>
        <StudioSectionLabel>Insérer comme nouvelle page</StudioSectionLabel>
        {templates === null ? (
          <p className="text-sm text-neutral-500">Chargement…</p>
        ) : (
          <div className="grid grid-cols-2 gap-2.5">
            {templates.map((template) => (
              <button
                key={template.id}
                type="button"
                onClick={() => insertAsNewPage(template)}
                disabled={readOnly || insertingId !== null}
                className="overflow-hidden rounded-md border border-neutral-200 text-left transition hover:border-animeo disabled:cursor-not-allowed disabled:opacity-50"
              >
                <TemplateThumbnailSketch layoutSketch={template.layoutSketch} />
                <p className="truncate px-2 py-1.5 text-[11px] font-semibold text-neutral-700">
                  {insertingId === template.id ? "Insertion…" : template.name}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>
    </StudioPanel>
  );
}
