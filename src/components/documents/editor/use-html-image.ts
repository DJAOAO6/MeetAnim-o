"use client";

import { useEffect, useState } from "react";

/**
 * Charge une image (data URI ou URL) pour Konva.Image, qui a besoin d'un
 * HTMLImageElement déjà chargé — pas de bibliothèque dédiée (use-image) pour
 * ~10 lignes, voir la règle "évite les dépendances inutiles" du plan.
 */
export function useHtmlImage(src: string): HTMLImageElement | null {
  const [image, setImage] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!src) return;
    const element = new window.Image();
    element.onload = () => setImage(element);
    element.src = src;
    return () => {
      element.onload = null;
    };
  }, [src]);

  // `src` vide dérivé au rendu plutôt que réinitialisé par un effet (voir
  // react-hooks/set-state-in-effect) — l'image déjà chargée reste en mémoire
  // pendant un changement de `src`, simplement masquée le temps du prochain
  // chargement plutôt qu'un retour à blanc.
  return src ? image : null;
}
