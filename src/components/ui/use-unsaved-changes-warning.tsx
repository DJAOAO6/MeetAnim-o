"use client";

import { useEffect, useRef, useState } from "react";
import { ConfirmModal } from "@/components/ui/confirm-modal";

/** La fermeture à poursuivre si la personne abandonne sa saisie. */
type Proceed = () => void;

// Les fenêtres ouvertes de confirmation (une seule en pratique : celle du
// tableau de bord). Un formulaire y dépose la fermeture qu'il voulait faire.
const hosts = new Set<(proceed: Proceed | null) => void>();

/**
 * « Quitter sans enregistrer ? » : la question est posée dans une fenêtre du
 * logiciel, montée une fois pour tout le tableau de bord (layout). Les
 * formulaires n'ont rien à rendre eux-mêmes : ils appellent `guard`.
 */
export function DiscardChangesHost() {
  const [pending, setPending] = useState<Proceed | null>(null);

  useEffect(() => {
    const host = (proceed: Proceed | null) => setPending(() => proceed);
    hosts.add(host);
    return () => {
      hosts.delete(host);
    };
  }, []);

  if (!pending) return null;
  return (
    <ConfirmModal
      title="Quitter sans enregistrer ?"
      message="Des modifications non enregistrées seront perdues."
      confirmLabel="Quitter sans enregistrer"
      cancelLabel="Continuer la saisie"
      onConfirm={() => {
        setPending(null);
        pending();
      }}
      onClose={() => setPending(null)}
    />
  );
}

/**
 * Avertit avant une perte de saisie (AUDIT_COMPLET.md P3-37) : ferme le
 * cas natif du navigateur (fermeture d'onglet, rafraîchissement) via
 * beforeunload tant que isDirty est vrai, et fournit guard() à appeler
 * autour de toute fermeture pilotée par l'app (bouton « Annuler »/« × »,
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

  /**
   * Poursuit tout de suite s'il n'y a rien à perdre ; sinon, seulement après
   * confirmation. Sans fenêtre montée (hors tableau de bord), rien ne peut
   * poser la question : la fermeture se fait, plutôt que de rester bloquée.
   */
  function guard(proceed: Proceed) {
    if (!isDirty || hosts.size === 0) {
      proceed();
      return;
    }
    for (const host of hosts) host(proceed);
  }

  return { guard };
}
