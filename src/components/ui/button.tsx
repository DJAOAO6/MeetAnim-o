"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "md" | "sm";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
};

/**
 * Styles repris tels quels des boutons déjà en place (rayon, graisse,
 * couleurs de thème) : ce composant n'introduit pas une nouvelle apparence,
 * il centralise celle qui existait, recopiée à l'identique dans des dizaines
 * de fichiers — au détail près de la hauteur, souvent trop faible pour le
 * tactile.
 */
const variantClassName: Record<ButtonVariant, string> = {
  primary: "bg-animeo text-white hover:bg-animeo-hover",
  secondary: "border border-animeo-border bg-transparent text-animeo-dark hover:bg-animeo-bg",
  ghost: "bg-transparent text-animeo-muted hover:bg-animeo-bg hover:text-animeo-dark",
  danger: "bg-animeo-error text-white hover:bg-animeo-danger",
};

// min-h-11 = 44 px : cible tactile confortable (WCAG 2.2 AAA « Target Size »,
// et recommandation d'Apple comme de Google). La taille "sm" descend à 36 px
// et n'est destinée qu'aux actions secondaires groupées dans une barre déjà
// dense, jamais à une action principale.
const sizeClassName: Record<ButtonSize, string> = {
  md: "min-h-11 px-5 py-2.5 text-sm",
  sm: "min-h-9 px-3.5 py-2 text-xs",
};

export function Button({ variant = "primary", size = "md", className = "", children, ...props }: ButtonProps) {
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-extrabold transition disabled:cursor-not-allowed disabled:opacity-60 ${variantClassName[variant]} ${sizeClassName[size]} ${className}`}
    >
      {children}
    </button>
  );
}
