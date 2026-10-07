"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { buttonBaseClassName, buttonSizeClassName, buttonVariantClassName } from "@/components/ui/button";

export type ActionMenuItem = {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  /** Supprimer, retirer : en rouge, et à placer en dernier. */
  destructive?: boolean;
  disabled?: boolean;
};

type SplitButtonProps = {
  /** L'action principale, celle du clic direct. */
  children: ReactNode;
  onClick: () => void;
  icon?: ReactNode;
  /** Les actions plus rares, rangées dans le menu accolé. */
  items: ActionMenuItem[];
  /** Nom du bouton-chevron, pour les lecteurs d'écran : « Autres actions d’ajout ». */
  menuLabel: string;
  variant?: "primary" | "secondary";
  /** Bord du bouton sur lequel le menu s'aligne. */
  align?: "start" | "end";
  disabled?: boolean;
  className?: string;
};

/**
 * Bouton double (PLAN-BOUTONS, règle 1.5) : l'action principale, et un
 * chevron qui ouvre le menu des actions rares — « Nouveau rendez-vous » et,
 * derrière, « Bloquer un créneau ».
 *
 * Le menu se manie comme un menu : ouverture au clic, à Entrée, à Espace ou à
 * la flèche du bas ; flèches haut et bas, Début, Fin ; Échap ou un clic
 * ailleurs referme, et le focus revient sur le chevron.
 */
export function SplitButton({ children, onClick, icon, items, menuLabel, variant = "primary", align = "end", disabled = false, className = "" }: SplitButtonProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  function menuItems(): HTMLButtonElement[] {
    return Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? []);
  }

  function close(returnFocus: boolean) {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }

  useEffect(() => {
    if (!open) return;
    // La première entrée reçoit le focus : les flèches partent de là.
    menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus();

    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      // En capture : Échap referme le menu sans refermer la fenêtre qui le contient.
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [open]);

  function handleMenuKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const entries = menuItems();
    if (entries.length === 0) return;
    const current = entries.indexOf(document.activeElement as HTMLButtonElement);
    const target = event.key === "ArrowDown" ? entries[(current + 1) % entries.length]
      : event.key === "ArrowUp" ? entries[(current - 1 + entries.length) % entries.length]
      : event.key === "Home" ? entries[0]
      : event.key === "End" ? entries[entries.length - 1]
      : null;
    if (target) {
      event.preventDefault();
      target.focus();
      return;
    }
    // Tab quitte le menu : il se referme, le focus suit son cours.
    if (event.key === "Tab") setOpen(false);
  }

  const half = `${buttonBaseClassName} ${buttonVariantClassName[variant]}`;
  // Le filet entre les deux moitiés : clair sur le bouton plein, contour sur l'autre.
  const divider = variant === "primary" ? "border-l border-white/30" : "-ml-px";

  return (
    <div ref={containerRef} className={`relative inline-flex ${className}`}>
      <button type="button" onClick={onClick} disabled={disabled} className={`${half} ${buttonSizeClassName.md} min-w-0 flex-1 rounded-r-none`}>
        {icon}
        {children}
      </button>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-label={menuLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => { if (event.key === "ArrowDown" && !open) { event.preventDefault(); setOpen(true); } }}
        className={`${half} ${divider} min-h-11 w-11 shrink-0 rounded-l-none`}
      >
        <ChevronDown aria-hidden="true" className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open ? (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={menuLabel}
          onKeyDown={handleMenuKeyDown}
          className={`absolute top-[calc(100%+0.375rem)] z-30 min-w-60 rounded-2xl border border-animeo-border bg-animeo-surface p-1.5 shadow-[0_16px_40px_rgb(var(--theme-shadow-rgb)/0.18)] ${align === "end" ? "right-0" : "left-0"}`}
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => { close(true); item.onSelect(); }}
              className={`flex min-h-11 w-full items-center gap-2.5 rounded-xl px-3 text-left text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                item.destructive ? "text-animeo-danger hover:bg-animeo-danger-soft focus-visible:bg-animeo-danger-soft" : "text-animeo-dark hover:bg-animeo-soft focus-visible:bg-animeo-soft"
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
