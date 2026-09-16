"use client";

import { useRef, useState } from "react";
import {
  formatDuration,
  formatMinutes,
  selectionFromClick,
  selectionFromDrag,
  snapDown,
  type SelectionBounds,
  type SlotSelection,
} from "@/lib/agenda-selection";

/** Marge sous laquelle le glissement fait défiler la page (§19). */
const AUTO_SCROLL_EDGE_PX = 72;
/** Vitesse au ras du bord ; elle décroît en s'éloignant, pour rester docile. */
const AUTO_SCROLL_MAX_SPEED_PX = 14;

/**
 * Zone interactive d'une colonne de jour.
 *
 * Elle est posée **sous** les rendez-vous : un clic sur un rendez-vous ne la
 * traverse jamais, c'est la carte du rendez-vous qui le reçoit. Les bandes de
 * fermeture sont déjà en `pointer-events-none`, donc une période fermée reste
 * cliquable — avec un menu adapté, pas le même que sur une zone ouverte.
 *
 * Règle tactile, la plus importante ici : **aucun glissement au doigt**.
 * `touch-action` n'est pas touché, aucun `touchmove` n'est annulé, et seul un
 * appui bref sans déplacement ouvre un créneau. Un doigt qui bouge fait
 * défiler l'agenda, comme avant — c'est la garantie demandée au §35.
 */
export function SlotSelectionLayer({ dayIndex, bounds, hourHeight, selection, closedAt, onSelect, onClear }: {
  dayIndex: number;
  bounds: SelectionBounds;
  hourHeight: number;
  /** Sélection en cours, si elle appartient à cette colonne. */
  selection: SlotSelection | null;
  /** Dit si une minute donnée tombe dans une période fermée. */
  closedAt: (minutes: number) => boolean;
  onSelect: (selection: SlotSelection, anchorRect: DOMRect, closed: boolean, pointerType: string) => void;
  onClear: () => void;
}) {
  const layerRef = useRef<HTMLDivElement>(null);
  const [hoverMinutes, setHoverMinutes] = useState<number | null>(null);
  // Sélection en cours de tracé, avant relâchement : gardée localement pour
  // que le glissement ne re-rende que cette colonne.
  const [drafting, setDrafting] = useState<SlotSelection | null>(null);
  const autoScrollRef = useRef<number | null>(null);
  // Vrai tant que la sélection peut encore grandir dans le sens du
  // défilement : passé les bornes de la journée, continuer à faire défiler la
  // page n'agrandit plus rien et donne l'impression d'un défilement emballé.
  const canGrowRef = useRef(true);

  function minutesAt(clientY: number): number {
    const rect = layerRef.current!.getBoundingClientRect();
    return bounds.dayStart + ((clientY - rect.top) / hourHeight) * 60;
  }

  function rectFor(target: SlotSelection): DOMRect {
    const rect = layerRef.current!.getBoundingClientRect();
    const top = rect.top + ((target.startMinutes - bounds.dayStart) / 60) * hourHeight;
    const height = ((target.endMinutes - target.startMinutes) / 60) * hourHeight;
    return new DOMRect(rect.left, top, rect.width, height);
  }

  function stopAutoScroll() {
    if (autoScrollRef.current !== null) {
      window.clearInterval(autoScrollRef.current);
      autoScrollRef.current = null;
    }
  }

  /**
   * Défilement doux quand le pointeur atteint le haut ou le bas de la fenêtre
   * pendant un tracé. Vitesse constante et modeste : un défilement qui
   * s'emballe rend la sélection impossible à arrêter.
   */
  function updateAutoScroll(clientY: number) {
    const distanceToBottom = window.innerHeight - clientY;
    const direction = clientY < AUTO_SCROLL_EDGE_PX ? -1 : distanceToBottom < AUTO_SCROLL_EDGE_PX ? 1 : 0;

    if (direction === 0 || !canGrowRef.current) { stopAutoScroll(); return; }
    if (autoScrollRef.current !== null) return;

    // Vitesse proportionnelle à l'enfoncement dans la zone : effleurer le bord
    // fait défiler doucement, s'y coller fait défiler franchement.
    const depth = direction === -1 ? AUTO_SCROLL_EDGE_PX - clientY : AUTO_SCROLL_EDGE_PX - distanceToBottom;
    const speed = Math.max(3, Math.round((depth / AUTO_SCROLL_EDGE_PX) * AUTO_SCROLL_MAX_SPEED_PX));

    autoScrollRef.current = window.setInterval(() => {
      if (!canGrowRef.current) { stopAutoScroll(); return; }
      window.scrollBy({ top: direction * speed });
    }, 16);
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    // Doigt et stylet : rien ici. Le geste est traité au relâchement (tap),
    // ce qui laisse le navigateur faire défiler sans jamais lui disputer le
    // pointeur.
    if (event.pointerType !== "mouse" || event.button !== 0) return;

    const anchorMinutes = minutesAt(event.clientY);
    const initial = selectionFromClick(dayIndex, anchorMinutes, bounds);
    if (!initial) { onClear(); return; }

    setDrafting(initial);
    const anchorSelection = initial;
    // Dernière position connue du pointeur : pointerup ne porte pas toujours
    // les mêmes coordonnées que le dernier pointermove selon le navigateur.
    let lastClientY = event.clientY;
    let moved = false;

    // AbortController plutôt que trois retraits d'écouteurs : le nettoyage ne
    // peut pas être oublié sur l'un des trois chemins de sortie.
    const controller = new AbortController();
    const { signal } = controller;

    function finish(apply: boolean) {
      controller.abort();
      canGrowRef.current = true;
      stopAutoScroll();
      setDrafting(null);
      if (!apply) return;

      // Sans mouvement, c'est un clic simple : le créneau par défaut.
      const finalSelection = moved
        ? selectionFromDrag(dayIndex, anchorMinutes, minutesAt(lastClientY), bounds) ?? anchorSelection
        : anchorSelection;
      onSelect(finalSelection, rectFor(finalSelection), closedAt(finalSelection.startMinutes), "mouse");
    }

    window.addEventListener("pointermove", (moveEvent) => {
      moved = true;
      lastClientY = moveEvent.clientY;
      updateAutoScroll(moveEvent.clientY);
      const next = selectionFromDrag(dayIndex, anchorMinutes, minutesAt(moveEvent.clientY), bounds);
      if (next) {
        canGrowRef.current = next.endMinutes < bounds.dayEnd && next.startMinutes > bounds.dayStart;
        setDrafting(next);
      }
    }, { signal });

    window.addEventListener("pointerup", () => finish(true), { signal });
    window.addEventListener("pointercancel", () => finish(false), { signal });
  }

  /**
   * Appui tactile. `onClick` plutôt que `pointerup` : le navigateur ne
   * déclenche un clic qu'après avoir décidé que le geste n'était pas un
   * défilement, ce qui est exactement l'arbitrage voulu.
   */
  function handleClick(event: React.MouseEvent<HTMLDivElement>) {
    // Les clics de souris sont déjà traités par le glissement ci-dessus.
    if (event.detail === 0 || drafting) return;
    const pointerType = (event.nativeEvent as PointerEvent).pointerType;
    if (pointerType === "mouse") return;

    const next = selectionFromClick(dayIndex, minutesAt(event.clientY), bounds);
    if (!next) { onClear(); return; }
    onSelect(next, rectFor(next), closedAt(next.startMinutes), pointerType || "touch");
  }

  const shown = drafting ?? selection;
  const hoverTop = hoverMinutes !== null ? ((snapDown(hoverMinutes, bounds.step) - bounds.dayStart) / 60) * hourHeight : 0;

  return (
    <div
      ref={layerRef}
      data-testid="agenda-slot-layer"
      data-day={dayIndex}
      // z-0 : sous les rendez-vous, qui gardent leurs propres clics.
      className="absolute inset-0 z-0 cursor-cell"
      onPointerDown={handlePointerDown}
      onClick={handleClick}
      // `buttons` à zéro : le repère de survol ne s'affiche pas pendant qu'un
      // rendez-vous est en cours de déplacement au-dessus de la grille — il
      // ferait croire qu'on peut lâcher là une sélection.
      onPointerMove={(event) => { if (event.pointerType === "mouse" && event.buttons === 0) setHoverMinutes(minutesAt(event.clientY)); }}
      onPointerLeave={() => setHoverMinutes(null)}
    >
      {/* Survol : un repère discret, juste assez pour comprendre que la zone
          répond. Pas de bouton « + » répété sur chaque case — l'agenda en
          serait constellé. */}
      {hoverMinutes !== null && !shown ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 rounded-md bg-animeo-soft/50"
          style={{ top: hoverTop, height: (bounds.step / 60) * hourHeight }}
        />
      ) : null}

      {shown ? (
        <div
          className="pointer-events-none absolute inset-x-0.5 z-[2] overflow-hidden rounded-xl border-2 border-animeo bg-animeo-soft/75"
          style={{
            top: ((shown.startMinutes - bounds.dayStart) / 60) * hourHeight,
            height: ((shown.endMinutes - shown.startMinutes) / 60) * hourHeight,
          }}
        >
          <p className="px-2 py-1 text-[11px] font-black leading-tight text-animeo-dark">
            {formatMinutes(shown.startMinutes)} → {formatMinutes(shown.endMinutes)}
          </p>
          <p className="px-2 text-[11px] font-bold leading-tight text-animeo-muted">
            {formatDuration(shown.endMinutes - shown.startMinutes)}
          </p>
        </div>
      ) : null}
    </div>
  );
}
