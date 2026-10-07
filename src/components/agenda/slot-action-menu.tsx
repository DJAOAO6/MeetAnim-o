"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { CalendarOff, CalendarPlus, Settings2, Ban, Unlock } from "lucide-react";
import { formatDuration, formatMinutes, type SlotSelection } from "@/lib/agenda-selection";
import { ActionMenuList, type ActionMenuItem } from "@/components/ui/action-menu";
import { Modal } from "@/components/ui/modal";
import { OverlayPortal } from "@/components/ui/overlay-portal";

export type SlotAction = "create" | "block" | "unavailable" | "more" | "openExceptionally" | "editHours";

const MENU_WIDTH = 264;
const GAP = 10;
const VIEWPORT_MARGIN = 12;

const dateFormatter = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" });

type SlotActionMenuProps = {
  selection: SlotSelection;
  date: Date;
  /** La plage choisie tombe dans une période fermée aux réservations. */
  closed: boolean;
  /** Le compte peut-il fermer un créneau (modifier les horaires) ? */
  canClose?: boolean;
  onAction: (action: SlotAction) => void;
  onClose: () => void;
} & (
  | {
      /** À la souris ou au clavier : le menu se pose à côté de la sélection. */
      presentation: "popover";
      anchorRect: DOMRect;
    }
  | {
      /** Au doigt : une feuille ancrée en bas, où l'on choisit aussi la durée. */
      presentation: "sheet";
      /** Durées réellement possibles ici, bornées par le rendez-vous suivant. */
      durations: number[];
      onSelectDuration: (minutes: number) => void;
    }
);

/**
 * Menu d'actions rapides d'un créneau sélectionné.
 *
 * Trois actions visibles, pas davantage : le but est d'enchaîner
 * « sélectionner → choisir → terminer » en deux secondes. Sur une zone fermée,
 * ce ne sont pas les mêmes actions : proposer « bloquer » un créneau déjà
 * fermé n'a aucun sens, alors qu'ouvrir exceptionnellement en a un.
 *
 * Une seule liste d'actions, deux présentations (PLAN-BOUTONS, 3.12) :
 *
 * - à la souris, un menu posé à côté de la plage qu'on vient de tracer ;
 * - au doigt, une feuille ancrée en bas. Il n'y a pas de glissement de
 *   sélection au doigt — le défilement de l'agenda reste prioritaire — : un
 *   appui choisit l'heure, et la durée se choisit ici, au pouce.
 */
export function SlotActionMenu(props: SlotActionMenuProps) {
  const { selection, date, closed, canClose = true, onAction, onClose } = props;
  const duration = selection.endMinutes - selection.startMinutes;
  const restricted = canClose ? undefined : "Réservé aux comptes autorisés à modifier les horaires.";
  const icon = "h-4 w-4 shrink-0";

  const items: ActionMenuItem[] = closed
    ? [
        { label: "Ouvrir exceptionnellement", icon: <Unlock aria-hidden="true" className={icon} />, tone: "positive", disabledReason: restricted, onSelect: () => onAction("openExceptionally") },
        { label: "Ajouter un rendez-vous", icon: <CalendarPlus aria-hidden="true" className={icon} />, onSelect: () => onAction("create") },
        { label: "Modifier les horaires", icon: <Settings2 aria-hidden="true" className={icon} />, onSelect: () => onAction("editHours") },
      ]
    : [
        { label: "Nouveau rendez-vous", icon: <CalendarPlus aria-hidden="true" className={icon} />, onSelect: () => onAction("create") },
        { label: "Bloquer le créneau", icon: <Ban aria-hidden="true" className={icon} />, onSelect: () => onAction("block") },
        { label: "Indisponible / Fermé", icon: <CalendarOff aria-hidden="true" className={icon} />, disabledReason: restricted, onSelect: () => onAction("unavailable") },
      ];

  const closedNotice = closed ? (
    <p className="mt-2 rounded-lg bg-animeo-border-soft px-2.5 py-1.5 text-xs font-bold text-animeo-muted">
      Cette période est fermée aux réservations.
    </p>
  ) : null;

  // L'action choisie décide elle-même de la suite (formulaire, blocage…) :
  // c'est l'agenda qui referme, pas la liste.
  const list = (autoFocus: boolean) => <ActionMenuList items={items} label="Actions du créneau" onDone={() => {}} autoFocus={autoFocus} />;

  if (props.presentation === "sheet") {
    return (
      <Modal title="Nouveau créneau" description={`${capitalize(dateFormatter.format(date))} · ${formatMinutes(selection.startMinutes)}`} onClose={onClose} size="sm">
        <div className="grid gap-4">
          <div>
            <p className="mb-2 text-xs font-extrabold uppercase tracking-[0.11em] text-animeo-muted">Durée</p>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Durée du créneau">
              {props.durations.map((option) => {
                const selected = option === duration;
                return (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => props.onSelectDuration(option)}
                    className={`min-h-11 rounded-xl border px-4 text-sm font-extrabold transition ${
                      selected ? "border-animeo bg-animeo-soft text-animeo-dark" : "border-animeo-border bg-animeo-bg text-animeo-muted"
                    }`}
                  >
                    {formatDuration(option)}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-animeo-muted">
              {formatMinutes(selection.startMinutes)} → {formatMinutes(selection.endMinutes)}
            </p>
            {closedNotice}
          </div>

          {/* Pas de focus forcé sur la première action : la feuille gère le sien. */}
          <div className="border-t border-animeo-border-soft pt-2">{list(false)}</div>
        </div>
      </Modal>
    );
  }

  return (
    <SlotPopover anchorRect={props.anchorRect} onClose={onClose}>
      <div className="px-2.5 pb-2 pt-1.5">
        <p className="text-xs font-extrabold uppercase tracking-[0.1em] text-animeo-muted">
          <span className="capitalize">{dateFormatter.format(date)}</span>
        </p>
        <p className="mt-1 text-sm font-black text-animeo-dark">
          {formatMinutes(selection.startMinutes)} → {formatMinutes(selection.endMinutes)}
        </p>
        <p className="text-xs text-animeo-muted">{formatDuration(duration)}</p>
        {closedNotice}
      </div>

      {/* La première action prend le focus : le menu s'utilise entièrement au
          clavier une fois ouvert. */}
      <div className="border-t border-animeo-border-soft pt-1.5">{list(true)}</div>
    </SlotPopover>
  );
}

/** Le menu flottant : posé à côté de la sélection, jamais hors de l'écran. */
function SlotPopover({ anchorRect, onClose, children }: { anchorRect: DOMRect; onClose: () => void; children: React.ReactNode }) {
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

  return (
    <OverlayPortal>
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
          className="fixed z-[56] w-[264px] rounded-2xl border border-animeo-border bg-animeo-surface p-2 shadow-[0_18px_44px_rgb(var(--theme-shadow-rgb)/0.18)]"
          style={{ top: position?.top ?? -9999, left: position?.left ?? -9999, visibility: position ? "visible" : "hidden" }}
        >
          {children}
        </div>
      </>
    </OverlayPortal>
  );
}

function capitalize(value: string): string {
  return value.charAt(0).toLocaleUpperCase("fr-FR") + value.slice(1);
}
