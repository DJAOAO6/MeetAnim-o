"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type RefObject } from "react";
import { MoreHorizontal } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { Modal } from "@/components/ui/modal";

export type ActionMenuItem = {
  label: string;
  icon?: ReactNode;
  onSelect?: () => void;
  /** L'entrée mène à une autre page plutôt que de déclencher une action. */
  href?: string;
  /** Avec `href` : ouvre dans un nouvel onglet (itinéraire, site externe). */
  external?: boolean;
  /** Supprimer, retirer, annuler : en rouge, et toujours en dernier. */
  destructive?: boolean;
  tone?: "positive";
  disabled?: boolean;
  /** Action indisponible pour ce compte : visible, grisée, et elle dit pourquoi. */
  disabledReason?: string;
  /** Choix courant d'une liste exclusive (application de navigation…). */
  checked?: boolean;
};

const ITEM_SELECTOR = '[role^="menuitem"]:not(:disabled)';

const PHONE_QUERY = "(max-width: 639.98px)";

function subscribePhone(onChange: () => void): () => void {
  const query = window.matchMedia(PHONE_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** Sous `sm` : l'écran d'un téléphone. Faux au rendu serveur, où la question n'a pas de réponse. */
export function useIsPhone(): boolean {
  return useSyncExternalStore(subscribePhone, () => window.matchMedia(PHONE_QUERY).matches, () => false);
}

/**
 * La liste d'un menu d'actions, et seulement elle : rôles, entrées de 44 px,
 * flèches haut et bas, Début, Fin. L'entrée destructrice passe en dernier,
 * séparée des autres.
 *
 * Elle ne sait ni s'ouvrir ni se fermer : c'est l'affaire de ce qui la porte
 * (`ActionMenu`, la fenêtre d'un créneau de l'agenda).
 */
export function ActionMenuList({ items, label, onDone, autoFocus = true, id }: {
  items: ActionMenuItem[];
  /** Nom du menu pour les lecteurs d'écran. */
  label: string;
  /** Une entrée vient d'être choisie : à l'appelant de refermer. */
  onDone: () => void;
  /** Le focus va sur la première entrée à l'ouverture (pas dans une feuille, qui gère le sien). */
  autoFocus?: boolean;
  id?: string;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoFocus) listRef.current?.querySelector<HTMLElement>(ITEM_SELECTOR)?.focus();
  }, [autoFocus]);

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const entries = Array.from(listRef.current?.querySelectorAll<HTMLElement>(ITEM_SELECTOR) ?? []);
    if (entries.length === 0) return;
    const current = entries.indexOf(document.activeElement as HTMLElement);
    const target = event.key === "ArrowDown" ? entries[(current + 1) % entries.length]
      : event.key === "ArrowUp" ? entries[(current - 1 + entries.length) % entries.length]
      : event.key === "Home" ? entries[0]
      : event.key === "End" ? entries[entries.length - 1]
      : null;
    if (!target) return;
    event.preventDefault();
    target.focus();
  }

  const regular = items.filter((item) => !item.destructive);
  const destructive = items.filter((item) => item.destructive);

  return (
    <div ref={listRef} id={id} role="menu" aria-label={label} onKeyDown={handleKeyDown}>
      {[...regular, ...destructive].map((item, index) => (
        <MenuEntry key={item.label} item={item} separated={item.destructive === true && index === regular.length && regular.length > 0} onDone={onDone} />
      ))}
    </div>
  );
}

function MenuEntry({ item, separated, onDone }: { item: ActionMenuItem; separated: boolean; onDone: () => void }) {
  const unavailable = Boolean(item.disabledReason);
  const role = item.checked === undefined ? "menuitem" : "menuitemradio";
  const className = `flex min-h-11 w-full items-center gap-2.5 rounded-xl px-3 py-1.5 text-left text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-60 ${separated ? "mt-1 border-t border-animeo-border-soft" : ""} ${
    unavailable ? "cursor-not-allowed text-animeo-muted opacity-60"
      : item.destructive ? "text-animeo-danger hover:bg-animeo-danger-soft focus-visible:bg-animeo-danger-soft"
      : item.tone === "positive" ? "text-animeo-positive hover:bg-animeo-soft focus-visible:bg-animeo-soft"
      : "text-animeo-dark hover:bg-animeo-soft focus-visible:bg-animeo-soft"
  } ${item.checked ? "bg-animeo-soft" : ""}`;
  const content = (
    <>
      {item.icon}
      <span className="min-w-0">
        {item.label}
        {item.disabledReason ? <span className="block text-xs font-semibold">{item.disabledReason}</span> : null}
      </span>
    </>
  );

  function select() {
    onDone();
    item.onSelect?.();
  }

  if (item.href && !unavailable && !item.disabled) {
    return item.external ? (
      <a role={role} aria-checked={item.checked} href={item.href} target="_blank" rel="noopener noreferrer" onClick={select} className={className}>{content}</a>
    ) : (
      <Link role={role} aria-checked={item.checked} href={item.href} onClick={select} className={className}>{content}</Link>
    );
  }

  return (
    <button
      type="button"
      role={role}
      aria-checked={item.checked}
      disabled={item.disabled}
      aria-disabled={unavailable ? true : undefined}
      title={item.disabledReason}
      onClick={unavailable ? undefined : select}
      className={className}
    >
      {content}
    </button>
  );
}

type ActionMenuProps = {
  open: boolean;
  /** `returnFocus` : le menu se referme sans qu'une autre fenêtre prenne la suite — le focus revient au déclencheur. */
  onClose: (returnFocus: boolean) => void;
  items: ActionMenuItem[];
  label: string;
  /** Titre de la feuille sur téléphone ; le nom du menu par défaut. */
  sheetTitle?: string;
  /** Ce qui entoure le déclencheur et le menu : un clic hors de lui referme. */
  containerRef: RefObject<HTMLElement | null>;
  align?: "start" | "end";
  side?: "bottom" | "top";
  /** Texte d'aide sous les entrées. */
  footer?: ReactNode;
  id?: string;
};

/**
 * Menu d'actions (PLAN-BOUTONS, 3.12) : un seul composant pour le « ⋯ » d'une
 * ligne, le chevron d'un bouton double, les outils de la carte.
 *
 * Sur ordinateur, il s'ouvre sous son déclencheur. Sur téléphone, il devient
 * une feuille ancrée en bas : les entrées tombent sous le pouce, et un menu
 * accroché à un petit bouton ne sort plus de l'écran.
 *
 * Échap ou un clic ailleurs referme ; les flèches parcourent les entrées.
 */
export function ActionMenu({ open, onClose, items, label, sheetTitle, containerRef, align = "end", side = "bottom", footer, id }: ActionMenuProps) {
  const phone = useIsPhone();

  useEffect(() => {
    // La feuille (Modal) gère elle-même Échap, le fond et le focus.
    if (!open || phone) return;
    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) onClose(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      // En capture : Échap referme le menu sans refermer la fenêtre qui le contient.
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onClose(true);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [open, phone, containerRef, onClose]);

  if (!open) return null;

  if (phone) {
    return (
      <Modal title={sheetTitle ?? label} onClose={() => onClose(true)} size="sm">
        <ActionMenuList id={id} items={items} label={label} onDone={() => onClose(true)} autoFocus={false} />
        {footer}
      </Modal>
    );
  }

  return (
    <div
      // Tab quitte le menu : il se referme, le focus suit son cours.
      onKeyDown={(event) => { if (event.key === "Tab") onClose(false); }}
      className={`absolute z-30 w-max min-w-60 max-w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-animeo-border bg-animeo-surface p-1.5 text-left shadow-[0_16px_40px_rgb(var(--theme-shadow-rgb)/0.18)] ${
        side === "bottom" ? "top-[calc(100%+0.375rem)]" : "bottom-[calc(100%+0.375rem)]"
      } ${align === "end" ? "right-0" : "left-0"}`}
    >
      <ActionMenuList id={id} items={items} label={label} onDone={() => onClose(true)} />
      {footer}
    </div>
  );
}

/** Hauteur d'un menu déplié, pour décider de l'ouvrir vers le haut. */
function estimatedHeight(count: number): number {
  return count * 46 + 20;
}

/**
 * Faut-il ouvrir vers le haut ? Oui quand la place manque dessous — bas d'une
 * liste qui défile, bas de l'écran — et qu'elle existe dessus : sinon le menu
 * serait coupé par le bord de la liste.
 */
export function shouldOpenUpward(container: HTMLElement, itemCount: number): boolean {
  const height = estimatedHeight(itemCount);
  const box = container.getBoundingClientRect();
  let limit = window.innerHeight;
  for (let parent = container.parentElement; parent; parent = parent.parentElement) {
    const { overflowY } = getComputedStyle(parent);
    if (overflowY === "auto" || overflowY === "scroll") { limit = Math.min(limit, parent.getBoundingClientRect().bottom); break; }
  }
  return limit - box.bottom < height && box.top > height;
}

/**
 * Le « ⋯ » d'une ligne : un bouton à icône qui ouvre son menu d'actions.
 * `label` nomme le bouton pour les lecteurs d'écran (« Actions pour le
 * rendez-vous de Rex ») et sert d'infobulle.
 */
export function ActionMenuButton({ label, items, icon, align = "end", sheetTitle, className = "" }: {
  label: string;
  items: ActionMenuItem[];
  /** L'icône du déclencheur ; « ⋯ » par défaut. */
  icon?: ReactNode;
  align?: "start" | "end";
  sheetTitle?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [upward, setUpward] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  function toggle() {
    if (!open && containerRef.current) setUpward(shouldOpenUpward(containerRef.current, items.length));
    setOpen((current) => !current);
  }

  return (
    <div ref={containerRef} className={`relative shrink-0 ${className}`}>
      <IconButton
        ref={triggerRef}
        label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={toggle}
        onKeyDown={(event) => { if (event.key === "ArrowDown" && !open) { event.preventDefault(); toggle(); } }}
        tooltipAlign={align}
        // Menu ouvert : l'infobulle se tait, elle le recouvrirait.
        className={open ? "[&>[data-tooltip]]:hidden!" : ""}
      >
        {icon ?? <MoreHorizontal aria-hidden="true" className="h-5 w-5" />}
      </IconButton>
      <ActionMenu
        open={open}
        onClose={(returnFocus) => { setOpen(false); if (returnFocus) triggerRef.current?.focus(); }}
        items={items}
        label={label}
        sheetTitle={sheetTitle}
        containerRef={containerRef}
        align={align}
        side={upward ? "top" : "bottom"}
      />
    </div>
  );
}
