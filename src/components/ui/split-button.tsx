"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { ActionMenu, type ActionMenuItem } from "@/components/ui/action-menu";
import { buttonBaseClassName, buttonSizeClassName, buttonVariantClassName } from "@/components/ui/button";

export type { ActionMenuItem };

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
 * Le menu est celui de tout le produit (`ActionMenu`) : ouverture au clic, à
 * Entrée, à Espace ou à la flèche du bas ; flèches haut et bas, Début, Fin ;
 * Échap ou un clic ailleurs referme, et le focus revient sur le chevron. Sur
 * téléphone, il s'ouvre en feuille basse.
 */
export function SplitButton({ children, onClick, icon, items, menuLabel, variant = "primary", align = "end", disabled = false, className = "" }: SplitButtonProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

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

      <ActionMenu
        id={menuId}
        open={open}
        onClose={(returnFocus) => { setOpen(false); if (returnFocus) triggerRef.current?.focus(); }}
        items={items}
        label={menuLabel}
        containerRef={containerRef}
        align={align}
      />
    </div>
  );
}
