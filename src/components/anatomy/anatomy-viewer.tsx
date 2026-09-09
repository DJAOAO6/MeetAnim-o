"use client";

import { useMemo, useState } from "react";
import { AnatomicalIllustration } from "@/components/anatomy/anatomical-illustration";
import { AnatomyLabels, LABEL_GUTTER } from "@/components/anatomy/anatomy-labels";
import { InteractiveAnatomyOverlay, type AnatomyObservation } from "@/components/anatomy/interactive-anatomy-overlay";
import { anatomyPath, findAnatomyNode } from "@/lib/anatomy/taxonomy";
import type { LabelCandidate } from "@/lib/anatomy/label-placement";
import type { AnatomyView } from "@/lib/anatomy/views";

export type { AnatomyObservation };

type AnatomyViewerProps = {
  view: AnatomyView;
  observations?: AnatomyObservation[];
  selectedZoneId?: string | null;
  onSelectZone?: (zoneId: string) => void;
  /** Survol piloté de l'extérieur (liste anatomique ↔ schéma). */
  externalHoveredZoneId?: string | null;
  onHoverZone?: (zoneId: string | null) => void;
  /** Libellés reliés aux zones observées — remplacent l'ancienne légende. */
  showLabels?: boolean;
  readOnly?: boolean;
  className?: string;
};

/**
 * Couche 0/3 : l'ORCHESTRATEUR. Il ne sait rien du Studio, ni de Konva, ni de
 * Prisma — il reçoit une vue, des observations et deux callbacks. C'est ce qui
 * le rend réutilisable tel quel hors de l'éditeur de documents (fiche animal,
 * écran de consultation), et remplaçable illustration par illustration.
 *
 * Les trois couches partagent un unique viewBox : changer d'illustration ne
 * demande que de réaligner les coordonnées des hitboxes (lib/anatomy/views.ts).
 */
export function AnatomyViewer({
  view,
  observations = [],
  selectedZoneId = null,
  onSelectZone,
  externalHoveredZoneId = null,
  onHoverZone,
  showLabels = false,
  readOnly = false,
  className,
}: AnatomyViewerProps) {
  const [internalHover, setInternalHover] = useState<string | null>(null);
  const hoveredZoneId = externalHoveredZoneId ?? internalHover;

  const observationsByZone = useMemo(() => {
    const map = new Map<string, AnatomyObservation>();
    for (const observation of observations) map.set(observation.zoneId, observation);
    return map;
  }, [observations]);

  function handleHover(zoneId: string | null) {
    setInternalHover(zoneId);
    onHoverZone?.(zoneId);
  }

  // Les libellés vivent dans une gouttière de part et d'autre : le cadre
  // rendu est donc plus large que l'illustration, sans quoi ils la
  // recouvriraient. Sans libellés, aucune gouttière — l'illustration occupe
  // toute la largeur disponible.
  const gutter = showLabels ? LABEL_GUTTER : 0;
  const frameWidth = view.viewBox.width + gutter * 2;

  const labelCandidates: LabelCandidate[] = useMemo(() => {
    if (!showLabels) return [];
    return view.hitboxes
      .filter((hitbox) => observationsByZone.has(hitbox.zoneId))
      .map((hitbox) => {
        const observation = observationsByZone.get(hitbox.zoneId)!;
        const node = findAnatomyNode(hitbox.zoneId);
        return {
          id: hitbox.zoneId,
          anchor: hitbox.labelAnchor,
          // Le côté est déjà porté par la vue : « Genou » suffit sur le
          // schéma, le nom complet reste dans l'aria-label et la liste.
          title: node?.shortLabel ?? node?.label ?? hitbox.zoneId,
          // Le type d'observation est écrit, pas seulement couleuré.
          subtitle: observation.typeLabel,
          color: observation.color,
        };
      });
  }, [showLabels, view, observationsByZone]);

  const tooltipZoneId = hoveredZoneId;
  const tooltip = tooltipZoneId ? buildTooltip(view, tooltipZoneId, observationsByZone.get(tooltipZoneId) ?? null, gutter) : null;

  // Quand une zone est survolée, les autres libellés s'effacent légèrement
  // pour que l'attention suive le pointeur sans que rien ne disparaisse.
  const dimmedLabelIds = useMemo(() => {
    if (!hoveredZoneId) return undefined;
    const dimmed = new Set(labelCandidates.map((candidate) => candidate.id));
    dimmed.delete(hoveredZoneId);
    return dimmed;
  }, [hoveredZoneId, labelCandidates]);

  return (
    <figure className={className}>
      <div className="relative">
        <svg
          viewBox={`${-gutter} 0 ${frameWidth} ${view.viewBox.height}`}
          className="block w-full"
          role="group"
          aria-label={`${view.label} — zones anatomiques`}
        >
          <AnatomicalIllustration view={view} />
          {showLabels ? <AnatomyLabels view={view} candidates={labelCandidates} dimmedIds={dimmedLabelIds} /> : null}
          <InteractiveAnatomyOverlay
            view={view}
            observationsByZone={observationsByZone}
            selectedZoneId={selectedZoneId}
            hoveredZoneId={hoveredZoneId}
            onHoverZone={handleHover}
            onSelectZone={(zoneId) => onSelectZone?.(zoneId)}
            readOnly={readOnly}
          />
        </svg>

        {tooltip ? (
          <div
            role="tooltip"
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md bg-animeo-dark px-2.5 py-1.5 text-[11px] leading-tight font-semibold text-white shadow-sm"
            style={{ left: `${tooltip.left}%`, top: `${tooltip.top}%` }}
          >
            {tooltip.title}
            {tooltip.detail ? <span className="block font-normal text-white/75">{tooltip.detail}</span> : null}
          </div>
        ) : null}
      </div>

      {view.awaitingIllustration ? (
        <figcaption className="mt-2 flex items-center gap-2 rounded-md border border-dashed border-neutral-300 bg-neutral-50 px-3 py-2 text-[11px] leading-relaxed text-neutral-600">
          <span className="inline-flex shrink-0 items-center rounded bg-neutral-200 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-neutral-700 uppercase">
            Provisoire
          </span>
          <span>
            Carte des zones interactives — l’illustration anatomique définitive n’est pas encore intégrée. Le repérage
            fonctionne, le rendu visuel n’est pas celui de la version finale.
          </span>
        </figcaption>
      ) : null}
    </figure>
  );
}

function buildTooltip(view: AnatomyView, zoneId: string, observation: AnatomyObservation | null, gutter: number) {
  const hitbox = view.hitboxes.find((candidate) => candidate.zoneId === zoneId);
  if (!hitbox) return null;

  const node = findAnatomyNode(zoneId);
  // Fil d'Ariane sans la racine de l'espèce ni la zone elle-même :
  // « Rachis › Lombaires » sous le titre « L5 ».
  const path = anatomyPath(zoneId).slice(1, -1).map((step) => step.label);

  // Pourcentages du CADRE rendu (gouttières comprises), pas du viewBox de
  // l'illustration : sans ce décalage, l'infobulle glisserait vers la gauche
  // dès que les libellés sont affichés.
  const frameWidth = view.viewBox.width + gutter * 2;

  return {
    left: ((hitbox.labelAnchor.x + gutter) / frameWidth) * 100,
    top: (hitbox.labelAnchor.y / view.viewBox.height) * 100 - 1,
    title: node?.label ?? zoneId,
    detail: observation ? observation.typeLabel : path.join(" › "),
  };
}
