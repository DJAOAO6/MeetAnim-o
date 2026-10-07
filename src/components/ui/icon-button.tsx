"use client";

import type { ComponentProps, ReactNode } from "react";
import { TooltipBubble, tooltipHostClassName } from "@/components/ui/tooltip";

type IconButtonVariant = "secondary" | "danger";

type IconButtonProps = Omit<ComponentProps<"button">, "aria-label" | "title" | "children"> & {
  /** Obligatoire : c'est le nom du bouton pour les lecteurs d'écran, et son infobulle. */
  label: string;
  variant?: IconButtonVariant;
  /** Où l'infobulle s'ouvre, quand la place manque au-dessus. */
  tooltipSide?: ComponentProps<typeof TooltipBubble>["side"];
  tooltipAlign?: ComponentProps<typeof TooltipBubble>["align"];
  /** L'icône (lucide), sans texte. */
  children: ReactNode;
};

// `danger` : seule l'icône rougit, le fond reste celui des autres boutons à
// icône — une corbeille dans une liste ne doit pas peser plus que ses voisins.
const variantClassName: Record<IconButtonVariant, string> = {
  secondary: "text-animeo-dark hover:bg-animeo-soft",
  danger: "text-animeo-danger hover:bg-animeo-danger-soft",
};

/**
 * Bouton à icône seule (PLAN-BOUTONS, modèle 4) : carré de 44 px, réservé aux
 * icônes universelles — flèches, fermer, corbeille, aide, « ⋯ », réglages
 * d'affichage. Tout le reste garde son texte.
 */
export function IconButton({ label, variant = "secondary", tooltipSide = "top", tooltipAlign = "center", type = "button", className = "", children, ...props }: IconButtonProps) {
  return (
    <button
      {...props}
      type={type}
      aria-label={label}
      className={`${tooltipHostClassName} inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-animeo-border bg-animeo-surface transition enabled:active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60 ${variantClassName[variant]} ${className}`}
    >
      {children}
      <TooltipBubble label={label} side={tooltipSide} align={tooltipAlign} />
    </button>
  );
}
