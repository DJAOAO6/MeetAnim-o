"use client";

import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { useHasMounted } from "@/components/ui/use-has-mounted";

/**
 * Rend une fenêtre superposée (modale, feuille, menu plein écran) hors du
 * contenu de la page (<main>), au niveau de la surface de thème.
 *
 * Le contenu du tableau de bord est isolé (`isolation: isolate` sur <main>)
 * pour qu'aucun de ses éléments ne passe jamais au-dessus du menu latéral.
 * Une fenêtre restée dans <main> y serait enfermée, donc sous le menu, l'en-
 * tête mobile et la barre du bas : elle passe par ce portail pour rester
 * au-dessus de tout. Le contexte React (fournisseurs, événements) est
 * conservé, seul l'emplacement dans le DOM change.
 */
export function OverlayPortal({ children }: { children: ReactNode }) {
  const mounted = useHasMounted();
  if (!mounted) return null;
  return createPortal(children, overlayRoot());
}

/**
 * Où poser une fenêtre : sur la surface de thème du tableau de bord, qui
 * porte la palette, le mode sombre et leurs réglages (voir globals.css) —
 * posée dans <body>, la fenêtre retombait sur la palette claire par défaut.
 * Hors tableau de bord (pages publiques), <body>.
 */
export function overlayRoot(): HTMLElement {
  return document.querySelector<HTMLElement>("[data-dashboard-theme]") ?? document.body;
}
