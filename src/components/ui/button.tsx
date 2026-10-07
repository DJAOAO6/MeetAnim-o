"use client";

import type { ComponentProps, ReactNode } from "react";

/**
 * Les modèles de bouton du produit (PLAN-BOUTONS, règle 1.1) :
 *
 * - `primary` : l'action principale, une seule par écran ou par carte ;
 * - `secondary` : toutes les autres actions ;
 * - `danger` : supprimer, refuser, retirer — dans la page ;
 * - `dangerSolid` : le même geste, confirmé — réservé aux fenêtres de
 *   confirmation ;
 * - `ghost` : dépréciée. Un bouton d'action a toujours une forme visible
 *   (règle 1.2) : à remplacer par `secondary` au fil des migrations.
 */
export type ButtonVariant = "primary" | "secondary" | "danger" | "dangerSolid" | "ghost";
export type ButtonSize = "md" | "sm";

type ButtonProps = ComponentProps<"button"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Icône posée à gauche du texte. */
  icon?: ReactNode;
  children: ReactNode;
};

// `secondary` sur la surface du thème, jamais `bg-white` : la règle qui
// repeint les fonds blancs du tableau de bord l'emportait sur le survol.
// `dangerSolid` : rouge du thème et texte de surface — le rouge fixe
// (#d95c5c) ne donnait que 3,7:1 sous du blanc ; ce couple-ci tient 5:1 au
// moins dans les deux palettes, en clair comme en sombre.
export const buttonVariantClassName: Record<ButtonVariant, string> = {
  primary: "bg-animeo text-white hover:bg-animeo-hover",
  secondary: "border border-animeo-border bg-animeo-surface text-animeo-dark hover:bg-animeo-soft",
  danger: "bg-animeo-danger-soft text-animeo-danger hover:bg-animeo-danger-border",
  dangerSolid: "bg-animeo-danger text-animeo-surface hover:brightness-90",
  ghost: "bg-transparent text-animeo-muted hover:bg-animeo-bg hover:text-animeo-dark",
};

// min-h-11 = 44 px : cible tactile confortable (WCAG 2.2 AAA « Target Size »,
// et recommandation d'Apple comme de Google). La taille "sm" descend à 36 px
// et n'est destinée qu'aux barres d'outils denses de l'éditeur de documents,
// jamais à une action principale.
export const buttonSizeClassName: Record<ButtonSize, string> = {
  md: "min-h-11 px-5 py-2.5 text-sm",
  sm: "min-h-9 px-3.5 py-2 text-xs",
};

/** Ce que tout bouton partage : forme, transition, retour à l'appui, état désactivé. */
export const buttonBaseClassName = "inline-flex items-center justify-center gap-2 rounded-xl font-extrabold transition enabled:active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60";

export function Button({ variant = "primary", size = "md", icon, className = "", children, ...props }: ButtonProps) {
  return (
    <button {...props} className={`${buttonBaseClassName} ${buttonVariantClassName[variant]} ${buttonSizeClassName[size]} ${className}`}>
      {icon}
      {children}
    </button>
  );
}
