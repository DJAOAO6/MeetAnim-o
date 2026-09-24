"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { CalendarOff, CalendarPlus, Settings2, Ban, Unlock } from "lucide-react";
import { formatDuration, formatMinutes, type SlotSelection } from "@/lib/agenda-selection";

export type SlotAction = "create" | "block" | "unavailable" | "more" | "openExceptionally" | "editHours";

const MENU_WIDTH = 264;
const GAP = 10;
const VIEWPORT_MARGIN = 12;

const dateFormatter = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" });

/**
 * Menu d'actions rapides d'un créneau sélectionné.
 *
 * Trois actions visibles, pas davantage : le but est d'enchaîner
 * « sélectionner → choisir → terminer » en deux secondes. Tout le reste est
 * derrière « Plus d'options », qui ouvre le formulaire complet.
 *
 * Sur une zone fermée, ce ne sont pas les mêmes actions : proposer « bloquer »
 * un créneau déjà fermé n'a aucun sens, alors qu'ouvrir exceptionnellement en
 * a un.
 */
export function SlotActionMenu({ selection, date, closed, anchorRect, canClose = true, onAction, onClose }: {
  selection: SlotSelection;
  date: Date;
  /** La plage choisie tombe dans une période fermée aux réservations. */
  closed: boolean;
  anchorRect: DOMRect;
  /** Le compte peut-il fermer un créneau (modifier les horaires) ? */
  canClose?: boolean;
  onAction: (action: SlotAction) => void;
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  /**
   * Placement mesuré après rendu : à droite de la sélection s'il y a la place,
   * à gauche sinon, et remonté quand le bas de l'écran approche. Le menu ne
   * doit jamais sortir de l'écran ni recouvrir la sélection qu'il commente.
   */
  useLayoutEffect(() => {
    const height = menuRef.current?.offsetHeight ?? 220;
    const roomRight = window.innerWidth - anchorRect.right;

    const left = roomRight >= MENU_WIDTH + GAP + VIEWPORT_MARGIN
      ? anchorRect.right + GAP
      : Math.max(VIEWPORT_MARGIN, anchorRect.left - MENU_WIDTH - GAP);

    const preferredTop = anchorRect.top;
    const top = preferredTop + height + VIEWPORT_MARGIN > window.innerHeight
      ? Math.max(VIEWPORT_MARGIN, window.innerHeight - height - VIEWPORT_MARGIN)
      : Math.max(VIEWPORT_MARGIN, preferredTop);

    setPosition({ top, left });
  }, [anchorRect]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") { event.stopPropagation(); onClose(); }
    }
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [onClose]);

  // Le premier bouton prend le focus : le menu s'utilise entièrement au
  // clavier une fois ouvert.
  useEffect(() => {
    menuRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, []);

  const duration = selection.endMinutes - selection.startMinutes;

  return (
    <>
      {/* Capteur de clic extérieur : il ferme le menu sans avaler le clic
          suivant, pour qu'un clic ailleurs dans la grille démarre aussitôt
          une nouvelle sélection. */}
      <div
        role="presentation"
        className="fixed inset-0 z-[55]"
        onPointerDown={onClose}
      />

      <div
        ref={menuRef}
        role="dialog"
        aria-label="Actions du créneau sélectionné"
        className="fixed z-[56] w-[264px] rounded-2xl border border-animeo-border bg-white p-2 shadow-[0_18px_44px_rgb(var(--theme-shadow-rgb)/0.18)]"
        style={{ top: position?.top ?? -9999, left: position?.left ?? -9999, visibility: position ? "visible" : "hidden" }}
      >
        <div className="px-2.5 pb-2 pt-1.5">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-animeo-muted">
            <span className="capitalize">{dateFormatter.format(date)}</span>
          </p>
          <p className="mt-1 text-sm font-black text-animeo-dark">
            {formatMinutes(selection.startMinutes)} → {formatMinutes(selection.endMinutes)}
          </p>
          <p className="text-xs text-animeo-muted">{formatDuration(duration)}</p>

          {closed ? (
            <p className="mt-2 rounded-lg bg-animeo-border-soft px-2 py-1.5 text-[11px] font-bold text-animeo-muted">
              Cette période est fermée aux réservations.
            </p>
          ) : null}
        </div>

        <div className="border-t border-animeo-border-soft pt-1.5">
          {closed ? (
            <>
              <MenuItem icon={Unlock} label="Ouvrir exceptionnellement" tone="positive" onClick={() => onAction("openExceptionally")} />
              <MenuItem icon={CalendarPlus} label="Ajouter un rendez-vous" onClick={() => onAction("create")} />
              <MenuItem icon={Settings2} label="Modifier les horaires" onClick={() => onAction("editHours")} />
            </>
          ) : (
            <>
              <MenuItem icon={CalendarPlus} label="Nouveau rendez-vous" tone="primary" onClick={() => onAction("create")} />
              <MenuItem icon={Ban} label="Bloquer le créneau" onClick={() => onAction("block")} />
              <MenuItem icon={CalendarOff} label="Indisponible / Fermé" disabledReason={canClose ? undefined : "Réservé aux comptes autorisés à modifier les horaires."} onClick={() => onAction("unavailable")} />
            </>
          )}
        </div>
      </div>
    </>
  );
}

function MenuItem({ icon: ItemIcon, label, tone = "neutral", muted = false, disabledReason, onClick }: {
  icon: typeof CalendarPlus;
  label: string;
  tone?: "neutral" | "primary" | "positive";
  muted?: boolean;
  /** Action indisponible pour ce compte : visible, grisée, et elle dit pourquoi. */
  disabledReason?: string;
  onClick: () => void;
}) {
  const toneClassName = tone === "primary"
    ? "text-animeo-dark"
    : tone === "positive"
      ? "text-animeo-positive"
      : muted
        ? "text-animeo-muted"
        : "text-animeo-dark";

  return (
    <button
      type="button"
      onClick={disabledReason ? undefined : onClick}
      aria-disabled={disabledReason ? true : undefined}
      title={disabledReason}
      className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-left text-sm font-extrabold transition ${disabledReason ? "cursor-not-allowed text-animeo-muted opacity-60" : `hover:bg-animeo-bg ${toneClassName}`}`}
    >
      <ItemIcon aria-hidden="true" className="h-4 w-4 shrink-0" />
      <span className="min-w-0">
        {label}
        {disabledReason ? <span className="block text-[11px] font-semibold">{disabledReason}</span> : null}
      </span>
    </button>
  );
}
