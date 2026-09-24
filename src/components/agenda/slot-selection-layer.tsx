"use client";

import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import {
  formatDuration,
  formatMinutes,
  selectionFromClick,
  selectionFromDrag,
  overlapsBusy,
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
  // Survol : un seul repère par colonne, déplacé directement (transform) au
  // rythme de l'affichage — jamais un rendu React par mouvement de souris.
  const hoverRef = useRef<HTMLDivElement>(null);
  const hoverFrameRef = useRef<number | null>(null);
  const hoverYRef = useRef<number | null>(null);
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

  function hideHover() {
    hoverYRef.current = null;
    const hover = hoverRef.current;
    if (hover) hover.dataset.visible = "false";
    if (layerRef.current) layerRef.current.style.cursor = "";
  }

  /**
   * Place le repère sur la case survolée, si elle est libre : jamais sur un
   * rendez-vous, un créneau bloqué ou une zone fermée — là, curseur neutre.
   */
  function paintHover() {
    hoverFrameRef.current = null;
    const layer = layerRef.current;
    const hover = hoverRef.current;
    const clientY = hoverYRef.current;
    if (!layer || !hover || clientY === null) return;
    const start = Math.max(bounds.dayStart, snapDown(minutesAt(clientY), bounds.step));
    const end = Math.min(bounds.dayEnd, start + bounds.step);
    const free = start < bounds.dayEnd && !overlapsBusy(bounds.busy, start, end) && !closedAt(start);
    if (!free) {
      hover.dataset.visible = "false";
      layer.style.cursor = "default";
      return;
    }
    const height = ((end - start) / 60) * hourHeight;
    hover.style.transform = `translate3d(0, ${((start - bounds.dayStart) / 60) * hourHeight}px, 0)`;
    hover.style.height = `${height}px`;
    hover.dataset.tall = height >= 40 ? "true" : "false";
    hover.dataset.visible = "true";
    layer.style.cursor = "pointer";
  }

  function trackHover(event: React.PointerEvent<HTMLDivElement>) {
    // Souris seulement, et bouton relâché : pendant le déplacement d'un
    // rendez-vous, un repère ferait croire qu'on peut lâcher là une sélection.
    if (event.pointerType !== "mouse" || event.buttons !== 0) return;
    hoverYRef.current = event.clientY;
    if (hoverFrameRef.current === null) hoverFrameRef.current = window.requestAnimationFrame(paintHover);
  }

  useEffect(() => () => {
    if (hoverFrameRef.current !== null) window.cancelAnimationFrame(hoverFrameRef.current);
  }, []);

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    // Doigt et stylet : rien ici. Le geste est traité au relâchement (tap),
    // ce qui laisse le navigateur faire défiler sans jamais lui disputer le
    // pointeur.
    if (event.pointerType !== "mouse" || event.button !== 0) return;

    hideHover();
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

  return (
    <div
      ref={layerRef}
      data-testid="agenda-slot-layer"
      data-day={dayIndex}
      // z-0 : sous les rendez-vous, qui gardent leurs propres clics.
      className="absolute inset-0 z-0"
      onPointerDown={handlePointerDown}
      onClick={handleClick}
      onPointerMove={trackHover}
      onPointerLeave={hideHover}
    >
      {/* Survol (souris) : au repos, rien ; sur une case libre, un contour
          orange doux, un fond à peine teinté et un « + ». Contour en ombre
          intérieure : la case ne change jamais de taille. Masqué dès qu'une
          sélection est tracée. */}
      <div
        ref={hoverRef}
        aria-hidden="true"
        data-visible="false"
        data-tall="false"
        data-testid="agenda-slot-hover"
        className={`group pointer-events-none absolute inset-x-1 top-0 flex items-center justify-center gap-1 rounded-lg bg-[color-mix(in_srgb,var(--theme-brand)_7%,var(--theme-surface))] text-animeo opacity-0 shadow-[inset_0_0_0_1.5px_color-mix(in_srgb,var(--theme-brand)_55%,transparent)] transition-opacity duration-150 data-[visible=true]:opacity-100 ${shown ? "invisible" : ""}`}
      >
        <Plus className="h-4 w-4 shrink-0" strokeWidth={2.5} />
        <span className="text-[11px] font-extrabold group-data-[tall=false]:hidden">Nouveau RDV</span>
      </div>

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
