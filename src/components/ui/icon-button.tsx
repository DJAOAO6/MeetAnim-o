"use client";

import type { ComponentProps, ReactNode } from "react";
import { TooltipBubble, tooltipHostClassName } from "@/components/ui/tooltip";

type IconButtonVariant = "primary" | "secondary" | "danger";

type IconButtonProps = Omit<ComponentProps<"button">, "aria-label" | "title" | "children"> & {
  /** Obligatoire : c'est le nom du bouton pour les lecteurs d'écran, et son infobulle. */
  label: string;
  /** Infobulle plus courte que le nom, pour un bouton de ligne : « Monter » quand le nom dit « Monter Rex — Dupont ». */
  tooltip?: string;
  variant?: IconButtonVariant;
  /** Le bouton tient quelque chose d'ouvert (un panneau, un menu) : il reste marqué. */
  active?: boolean;
  /** Où l'infobulle s'ouvre, quand la place manque au-dessus. */
  tooltipSide?: ComponentProps<typeof TooltipBubble>["side"];
  tooltipAlign?: ComponentProps<typeof TooltipBubble>["align"];
  /** L'icône (lucide), sans texte. */
  children: ReactNode;
};

// `danger` : seule l'icône rougit, le fond reste celui des autres boutons à
// icône — une corbeille dans une liste ne doit pas peser plus que ses voisins.
// `primary` : plein, pour l'action attendue d'une ligne quand la place manque
// pour son texte (accepter une demande dans la liste des rendez-vous).
const variantClassName: Record<IconButtonVariant, string> = {
  primary: "border-transparent bg-animeo text-white hover:bg-animeo-hover",
  secondary: "text-animeo-dark hover:bg-animeo-soft",
  danger: "text-animeo-danger hover:bg-animeo-danger-soft",
};

/**
 * Bouton à icône seule (PLAN-BOUTONS, modèle 4) : carré de 44 px, réservé aux
 * icônes universelles — flèches, fermer, corbeille, aide, « ⋯ », réglages
 * d'affichage. Tout le reste garde son texte.
 */
export function IconButton({ label, tooltip, variant = "secondary", active = false, tooltipSide = "top", tooltipAlign = "center", type = "button", className = "", children, ...props }: IconButtonProps) {
  return (
    <button
      {...props}
      type={type}
      aria-label={label}
      className={`${tooltipHostClassName} inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition enabled:active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60 ${variant === "primary" ? "" : active ? "border-animeo bg-animeo-soft" : "border-animeo-border bg-animeo-surface"} ${variantClassName[variant]} ${className}`}
    >
      {children}
      <TooltipBubble label={tooltip ?? label} side={tooltipSide} align={tooltipAlign} />
    </button>
  );
}
