"use client";

import { createElement, useState, type FocusEvent, type KeyboardEvent } from "react";
import { shapeElementProps } from "@/components/anatomy/anatomical-illustration";
import { findAnatomyNode } from "@/lib/anatomy/taxonomy";
import type { AnatomyHitbox, AnatomyView } from "@/lib/anatomy/views";

export type AnatomyObservation = {
  zoneId: string;
  /** Couleur du type d'observation (préréglage) — jamais la seule porteuse de sens. */
  color: string;
  /** « Restriction », « Tension »… repris tel quel dans l'aria-label. */
  typeLabel: string;
};

type InteractiveAnatomyOverlayProps = {
  view: AnatomyView;
  observationsByZone: Map<string, AnatomyObservation>;
  selectedZoneId: string | null;
  hoveredZoneId: string | null;
  onHoverZone: (zoneId: string | null) => void;
  onSelectZone: (zoneId: string) => void;
  readOnly: boolean;
};

/**
 * Couche 2/3 : les ZONES INTERACTIVES. Transparente, superposée à
 * l'illustration dans le même viewBox — c'est elle qui porte la totalité de
 * l'interaction (survol, sélection, clavier), jamais l'illustration.
 *
 * Une zone observée est teintée par un remplissage translucide de la forme
 * anatomique elle-même (opacité ~0.22) et un contour légèrement plus marqué,
 * jamais par une pastille opaque posée sur l'animal.
 */
export function InteractiveAnatomyOverlay({
  view,
  observationsByZone,
  selectedZoneId,
  hoveredZoneId,
  onHoverZone,
  onSelectZone,
  readOnly,
}: InteractiveAnatomyOverlayProps) {
  return (
    <g>
      {view.hitboxes.map((hitbox) => (
        <AnatomyZone
          key={hitbox.zoneId}
          hitbox={hitbox}
          observation={observationsByZone.get(hitbox.zoneId) ?? null}
          selected={selectedZoneId === hitbox.zoneId}
          hovered={hoveredZoneId === hitbox.zoneId}
          onHover={onHoverZone}
          onSelect={onSelectZone}
          readOnly={readOnly}
        />
      ))}
    </g>
  );
}

function AnatomyZone({
  hitbox,
  observation,
  selected,
  hovered,
  onHover,
  onSelect,
  readOnly,
}: {
  hitbox: AnatomyHitbox;
  observation: AnatomyObservation | null;
  selected: boolean;
  hovered: boolean;
  onHover: (zoneId: string | null) => void;
  onSelect: (zoneId: string) => void;
  readOnly: boolean;
}) {
  const node = findAnatomyNode(hitbox.zoneId);
  const label = node?.label ?? hitbox.zoneId;
  const { element, props } = shapeElementProps(hitbox.shape);

  // L'anneau de focus est piloté par l'état plutôt que par la variante
  // Tailwind `[&:focus-visible>.anatomy-zone-focus]:opacity-100`, qui restait
  // sans effet (vérifié au Tab : opacity 0). Le <g> matche pourtant bien
  // `:focus-visible` — c'est la variante arbitraire à combinateur enfant qui
  // ne s'appliquait pas. On interroge donc `:focus-visible` directement, ce
  // qui garde la distinction clavier/souris sans dépendre de sa génération.
  const [keyboardFocused, setKeyboardFocused] = useState(false);

  function handleFocus(event: FocusEvent<SVGGElement>) {
    onHover(hitbox.zoneId);
    setKeyboardFocused(event.currentTarget.matches(":focus-visible"));
  }

  function handleBlur() {
    onHover(null);
    setKeyboardFocused(false);
  }

  // L'information n'est jamais portée par la seule couleur : le type
  // d'observation est dit dans le nom accessible, repris à l'identique dans
  // l'infobulle et dans la liste textuelle des observations.
  const accessibleName = observation ? `${label} — ${observation.typeLabel}` : label;

  const fillOpacity = observation ? (selected || hovered ? 0.34 : 0.22) : hovered || selected ? 0.12 : 0;
  const strokeOpacity = observation ? 1 : selected || hovered ? 0.9 : 0;
  const strokeWidth = selected ? 2.4 : observation ? 1.6 : 1.4;
  const color = observation?.color ?? "#2f7a6e";

  function handleKeyDown(event: KeyboardEvent<SVGGElement>) {
    if (readOnly) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onSelect(hitbox.zoneId);
  }

  return (
    <g
      role="button"
      tabIndex={readOnly ? -1 : 0}
      aria-label={accessibleName}
      aria-pressed={selected}
      data-zone-id={hitbox.zoneId}
      onClick={() => !readOnly && onSelect(hitbox.zoneId)}
      onKeyDown={handleKeyDown}
      onMouseEnter={() => onHover(hitbox.zoneId)}
      onMouseLeave={() => onHover(null)}
      onFocus={handleFocus}
      onBlur={handleBlur}
      className="outline-none"
    >
      {/* Forme visible : teinte translucide + contour, transition douce. */}
      {createElement(element, {
        ...props,
        fill: color,
        fillOpacity,
        stroke: color,
        strokeOpacity,
        strokeWidth,
        className: "pointer-events-none transition-[fill-opacity,stroke-opacity,stroke-width] duration-200 ease-out",
      })}

      {/* Anneau de focus clavier, distinct du survol à la souris. */}
      {createElement(element, {
        ...props,
        fill: "none",
        stroke: "#183b45",
        strokeWidth: 2,
        strokeDasharray: "5 4",
        opacity: keyboardFocused ? 1 : 0,
        className: "anatomy-zone-focus pointer-events-none transition-opacity duration-150",
      })}

      {/* Cible de pointage, plus généreuse que la forme visible — et encore
          plus large sur écran tactile, où l'on vise moins précisément. */}
      {createElement(element, {
        ...props,
        fill: "transparent",
        stroke: "transparent",
        className: readOnly
          ? "pointer-events-none"
          : "cursor-pointer [stroke-width:12] pointer-coarse:[stroke-width:26]",
      })}
    </g>
  );
}
