"use client";

import { useEffect, useRef } from "react";

const DISCARD_MESSAGE = "Des modifications non enregistrées seront perdues. Voulez-vous vraiment quitter sans enregistrer ?";

/**
 * Version autonome de confirmDiscard, pour un parent qui doit garder son
 * propre bouton de fermeture (ex. le « × » d'un panneau englobant) au
 * courant de l'état modifié d'un enfant (ex. GlobalAppointmentsManager
 * fermant AppointmentForm) sans dupliquer l'écoute beforeunload du hook.
 */
export function confirmDiscardChanges(isDirty: boolean): boolean {
  if (!isDirty) return true;
  return window.confirm(DISCARD_MESSAGE);
}

/**
 * Avertit avant une perte de saisie (AUDIT_COMPLET.md P3-37) : ferme le
 * cas natif du navigateur (fermeture d'onglet, rafraîchissement) via
 * beforeunload tant que isDirty est vrai, et fournit confirmDiscard() à
 * appeler avant toute fermeture pilotée par l'app (bouton « Annuler »/« × »,
 * Échap) pour le même cas côté navigation interne.
 */
export function useUnsavedChangesWarning(isDirty: boolean) {
  const isDirtyRef = useRef(isDirty);
  useEffect(() => {
    isDirtyRef.current = isDirty;
  });

  useEffect(() => {
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      if (!isDirtyRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  function confirmDiscard(): boolean {
    return confirmDiscardChanges(isDirty);
  }

  return { confirmDiscard };
}
