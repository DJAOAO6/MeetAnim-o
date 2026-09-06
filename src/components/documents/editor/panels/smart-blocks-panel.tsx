"use client";

import { useDocumentStore } from "@/components/documents/editor/document-store";
import { StudioPanel, StudioSectionLabel } from "@/components/documents/editor/studio-chrome";
import { DEFAULT_POSITION, fieldElements, newElementId, rectElement, variableTextElement } from "@/components/documents/editor/element-factory";
import type { DocumentElement } from "@/lib/documents/content";

/**
 * Smart Blocks (étapes 3 et 9) — de simples préréglages multi-éléments
 * insérés en un clic (addElements, un seul instantané d'historique), pas
 * d'abstraction séparée. 8 blocs au total : les 3 d'origine enrichis de
 * légendes de champ (fieldElements), 5 nouveaux couvrant en-tête, pied de
 * page, rendez-vous, un résumé en 3 colonnes et un encadré de conseils.
 */
export function SmartBlocksPanel({ readOnly }: { readOnly: boolean }) {
  const addElements = useDocumentStore((state) => state.addElements);

  function insert(elements: DocumentElement[]) {
    addElements(elements);
  }

  function addAnimalCard() {
    const { x, y } = DEFAULT_POSITION;
    insert([
      rectElement(x, y, 260, 160, "#f7faf9", "#dce8e5"),
      ...fieldElements(x + 12, y + 12, 112, "Nom", "animal.name"),
      ...fieldElements(x + 136, y + 12, 112, "Espèce", "animal.species"),
      ...fieldElements(x + 12, y + 57, 112, "Race", "animal.breed"),
      ...fieldElements(x + 136, y + 57, 112, "Sexe", "animal.sex"),
      ...fieldElements(x + 12, y + 102, 112, "Poids", "animal.weight"),
      ...fieldElements(x + 136, y + 102, 112, "Naissance", "animal.birthDate"),
    ]);
  }

  function addOwnerCard() {
    const { x, y } = DEFAULT_POSITION;
    insert([
      rectElement(x, y, 260, 184, "#f7faf9", "#dce8e5"),
      ...fieldElements(x + 12, y + 12, 112, "Prénom", "client.firstName"),
      ...fieldElements(x + 136, y + 12, 112, "Nom", "client.lastName"),
      ...fieldElements(x + 12, y + 57, 112, "Téléphone", "client.phone"),
      ...fieldElements(x + 136, y + 57, 112, "Email", "client.email"),
      ...fieldElements(x + 12, y + 102, 236, "Adresse", "client.address", 44),
    ]);
  }

  function addAppointmentCard() {
    const { x, y } = DEFAULT_POSITION;
    insert([
      rectElement(x, y, 260, 160, "#f7faf9", "#dce8e5"),
      ...fieldElements(x + 12, y + 12, 112, "Date", "appointment.date"),
      ...fieldElements(x + 136, y + 12, 112, "Heure", "appointment.start"),
      ...fieldElements(x + 12, y + 57, 236, "Prestation", "appointment.serviceName"),
      ...fieldElements(x + 12, y + 102, 236, "Lieu", "appointment.location"),
    ]);
  }

  function addRecommendationsBlock() {
    const { x, y } = DEFAULT_POSITION;
    insert([
      rectElement(x, y, 320, 110, "#ffffff", "#4FAF9F"),
      { id: newElementId("text"), type: "text", x: x + 14, y: y + 12, width: 292, height: 86, rotation: 0, html: "<p><strong>Recommandations</strong></p><p></p>" },
    ]);
  }

  function addDocumentHeader() {
    const { x, y } = DEFAULT_POSITION;
    insert([
      rectElement(x, y, 500, 90, "#e4f5ef", "#e4f5ef"),
      variableTextElement("professional.company", x + 16, y + 14, 300, 28),
      { id: newElementId("text"), type: "text", x: x + 16, y: y + 46, width: 300, height: 30, rotation: 0, html: "<p><strong>Titre du document</strong></p>" },
      ...fieldElements(x + 350, y + 16, 134, "Date du rendez-vous", "appointment.date"),
    ]);
  }

  function addDocumentFooter() {
    const { x, y } = DEFAULT_POSITION;
    insert([
      rectElement(x, y, 500, 1, "#e5eceb", "#e5eceb"),
      { id: newElementId("text"), type: "text", x, y: y + 14, width: 280, height: 24, rotation: 0, html: "<p>Fait à _______________, le _______________</p>" },
      ...fieldElements(x, y + 52, 200, "Téléphone du cabinet", "professional.phone"),
      ...fieldElements(x + 220, y + 52, 200, "Email du cabinet", "professional.email"),
      rectElement(x + 340, y + 14, 160, 1, "#8a97a0", "#8a97a0"),
      { id: newElementId("text"), type: "text", x: x + 340, y: y + 20, width: 160, height: 18, rotation: 0, html: '<p style="margin:0;font-size:10px;color:#8a97a0">Signature</p>' },
    ]);
  }

  function addThreeColumnSummary() {
    const { x, y } = DEFAULT_POSITION;
    const colWidth = 226;
    const gap = 16;
    const columns = [
      { label: "Motif", color: "#2f7a6e", soft: "#e4f5ef" },
      { label: "Observations", color: "#b9762e", soft: "#fbeee0" },
      { label: "Recommandations", color: "#3a5f8a", soft: "#e8eff6" },
    ];
    const elements: DocumentElement[] = [];
    columns.forEach((column, index) => {
      const cx = x + index * (colWidth + gap);
      elements.push(
        rectElement(cx, y, colWidth, 28, column.soft, column.soft),
        {
          id: newElementId("text"),
          type: "text",
          x: cx + 10,
          y: y + 5,
          width: colWidth - 20,
          height: 18,
          rotation: 0,
          html: `<p style="margin:0;font-size:11px;font-weight:800;color:${column.color}">${column.label}</p>`,
        },
        { id: newElementId("text"), type: "text", x: cx, y: y + 36, width: colWidth, height: 160, rotation: 0, html: "<p></p>" },
      );
    });
    insert(elements);
  }

  function addFollowUpTips() {
    const { x, y } = DEFAULT_POSITION;
    insert([
      rectElement(x, y, 6, 100, "#4FAF9F", "#4FAF9F"),
      rectElement(x + 6, y, 314, 100, "#f7faf9", "#f7faf9"),
      { id: newElementId("text"), type: "text", x: x + 22, y: y + 12, width: 280, height: 76, rotation: 0, html: "<p><strong>Conseils de suivi</strong></p><p></p>" },
    ]);
  }

  const smartBlocks = [
    { label: "Carte animal", onClick: addAnimalCard },
    { label: "Infos propriétaire", onClick: addOwnerCard },
    { label: "Infos rendez-vous", onClick: addAppointmentCard },
    { label: "Recommandations", onClick: addRecommendationsBlock },
    { label: "En-tête de document", onClick: addDocumentHeader },
    { label: "Pied de page", onClick: addDocumentFooter },
    { label: "Résumé en 3 colonnes", onClick: addThreeColumnSummary },
    { label: "Conseils de suivi", onClick: addFollowUpTips },
  ];

  return (
    <StudioPanel id="studio-panel-blocks" title="Blocs Animéo">
      <div>
        <StudioSectionLabel>Insérer</StudioSectionLabel>
        <div className="space-y-1.5">
          {smartBlocks.map((block) => (
            <button
              key={block.label}
              type="button"
              onClick={block.onClick}
              disabled={readOnly}
              className="w-full rounded-md border border-neutral-200 px-3 py-2 text-left text-sm font-semibold text-neutral-700 transition hover:border-animeo hover:bg-animeo-soft disabled:cursor-not-allowed disabled:opacity-40"
            >
              {block.label}
            </button>
          ))}
        </div>
      </div>
    </StudioPanel>
  );
}
