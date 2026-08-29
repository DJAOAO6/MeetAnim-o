"use client";

import { useEffect, useRef } from "react";

const focusableSelector = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Piège de focus pour une fenêtre modale (role="dialog") — AUDIT_COMPLET.md
 * P0-3 : 9 des 12 modales du tableau de bord n'avaient ni focus initial, ni
 * piège de Tab, ni fermeture par Échap, les rendant inutilisables au clavier
 * seul. Au montage : déplace le focus dans la modale. Tant qu'elle est
 * ouverte : Tab/Shift+Tab restent cycliques à l'intérieur, Échap appelle
 * onClose. Au démontage : rend le focus à l'élément qui l'avait avant
 * l'ouverture (le déclencheur), reproduisant le comportement déjà correct
 * de la cloche de notifications et du calendrier de réservation publique.
 *
 * `active` couvre le cas d'une modale montée une seule fois par son parent
 * et ouverte/fermée via un état interne (ex. GlobalAppointmentsManager) —
 * plutôt que le cas le plus courant d'un composant démonté/remonté à
 * chaque ouverture, où le montage suffit déjà à déclencher l'effet.
 */
export function useModalFocusTrap<T extends HTMLElement>(onClose: () => void, active = true) {
  const containerRef = useRef<T | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!active) return;
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    const container = containerRef.current;

    function focusableElements(): HTMLElement[] {
      if (!container) return [];
      return Array.from(container.querySelectorAll<HTMLElement>(focusableSelector)).filter((el) => el.offsetParent !== null);
    }

    const frame = requestAnimationFrame(() => {
      (focusableElements()[0] ?? container)?.focus();
    });

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const items = focusableElements();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocusedRef.current?.focus();
    };
  }, [active]);

  return containerRef;
}
