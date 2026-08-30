"use client";

import { useSyncExternalStore } from "react";

const emptySubscribe = () => () => {};

/**
 * true seulement après l'hydratation côté client, jamais pendant le rendu
 * serveur ni la première passe client — le mécanisme getServerSnapshot de
 * React garantit que les deux valent `false`, donc identiques, évitant tout
 * mismatch d'hydratation. Utilisé pour différer un calcul dépendant de
 * l'horloge murale ou du fuseau du navigateur (AUDIT_COMPLET.md P2-18) sans
 * déclencher la règle ESLint react-hooks/set-state-in-effect (qui interdit
 * un setState direct dans un effet, même trivial).
 */
export function useHasMounted(): boolean {
  return useSyncExternalStore(emptySubscribe, () => true, () => false);
}
