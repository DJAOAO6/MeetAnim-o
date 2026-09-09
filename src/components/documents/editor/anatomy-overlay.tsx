"use client";

import { AnatomyViewer, type AnatomyObservation } from "@/components/anatomy/anatomy-viewer";
import { useDocumentStore } from "@/components/documents/editor/document-store";
import { colorForPreset, labelForPreset } from "@/lib/documents/marker-presets";
import { getAnatomyView } from "@/lib/anatomy/views";
import type { DocumentAnatomyElement } from "@/lib/documents/content";

/**
 * Surcouche DOM des schémas anatomiques, montée dans le MÊME conteneur que
 * la surcouche texte (document-editor-view.tsx) — donc capturée telle quelle
 * par l'export PDF, sans mécanisme d'export supplémentaire.
 *
 * Konva ne dessine qu'un rectangle fantôme sous chaque schéma (canvas-stage.tsx) :
 * tout le rendu et toute l'interaction (survol, infobulle, focus clavier,
 * transitions) vivent ici, ce que le canvas ne sait pas faire.
 */
export function AnatomyOverlay({ readOnly }: { readOnly: boolean }) {
  const content = useDocumentStore((state) => state.content);
  const currentPageIndex = useDocumentStore((state) => state.currentPageIndex);

  const page = content.pages[currentPageIndex];
  if (!page) return null;

  const elements = page.elements.filter(
    (element): element is DocumentAnatomyElement => element.type === "anatomy" && !element.hidden,
  );

  return (
    <>
      {elements.map((element) => (
        <AnatomyBlock key={element.id} element={element} readOnly={readOnly} />
      ))}
    </>
  );
}

function AnatomyBlock({ element, readOnly }: { element: DocumentAnatomyElement; readOnly: boolean }) {
  const markerPresets = useDocumentStore((state) => state.markerPresets);
  const selectedZoneId = useDocumentStore((state) => state.selectedZoneId);
  const selectAnatomyZone = useDocumentStore((state) => state.selectAnatomyZone);
  const selectElement = useDocumentStore((state) => state.selectElement);

  const view = getAnatomyView(element.viewId);
  if (!view) return null;

  const locked = readOnly || Boolean(element.locked);

  const observations: AnatomyObservation[] = element.observations.map((observation) => ({
    zoneId: observation.zoneId,
    color: colorForPreset(observation.presetId, markerPresets),
    typeLabel: labelForPreset(observation.presetId, markerPresets),
  }));

  // Toute la logique de sélection vit dans le store (selectAnatomyZone) :
  // le clic sur le schéma, l'autocomplete et la liste anatomique passent par
  // le même chemin, donc ne peuvent pas diverger.
  function handleSelectZone(zoneId: string) {
    selectElement(element.id);
    selectAnatomyZone(element.id, zoneId);
  }

  return (
    <div
      className="absolute"
      style={{
        left: element.x,
        top: element.y,
        width: element.width,
        height: element.height,
        transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined,
        transformOrigin: "top left",
        opacity: element.opacity ?? 1,
      }}
    >
      <AnatomyViewer
        view={view}
        observations={observations}
        selectedZoneId={selectedZoneId}
        onSelectZone={handleSelectZone}
        showLabels={element.showLabels}
        readOnly={locked}
        fill
      />
    </div>
  );
}
