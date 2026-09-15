"use client";

import { useEffect, useId, type ReactNode } from "react";
import { useModalFocusTrap } from "@/components/ui/use-modal-focus-trap";

type ModalSize = "sm" | "md" | "lg" | "xl";

type ModalProps = {
  title: string;
  description?: string;
  onClose: () => void;
  /** Largeur maximale sur écran large ; sans effet sur mobile, où la modale occupe toute la largeur. */
  size?: ModalSize;
  /**
   * Comportement sur petit écran. "sheet" (défaut) : feuille ancrée en bas,
   * atteignable au pouce. "fullscreen" : plein écran, pour les interfaces
   * denses (import, éditeur) qu'une feuille rendrait illisible.
   */
  mobile?: "sheet" | "fullscreen";
  /** Barre d'actions, collée en bas et toujours atteignable. */
  footer?: ReactNode;
  children: ReactNode;
};

const sizeClassName: Record<ModalSize, string> = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-lg",
  lg: "sm:max-w-2xl",
  xl: "sm:max-w-4xl",
};

/**
 * Coquille commune à toutes les fenêtres modales du produit. Elle existe
 * pour une raison précise : les 24 modales écrites à la main affichaient sur
 * téléphone une boîte centrée pensée pour un écran large — actions en bas
 * hors de portée du pouce, contenu comprimé, parfois tronqué.
 *
 * Sur écran large, la modale reste centrée. Sur téléphone elle devient une
 * feuille ancrée en bas (ou plein écran pour les interfaces denses), avec
 * un en-tête et une barre d'actions fixes, et seul le contenu qui défile :
 * le bouton principal reste toujours visible, même clavier ouvert.
 *
 * Fournit aussi ce que chaque modale réimplémentait : piège de focus,
 * fermeture par Échap, blocage du défilement de la page derrière, liaison
 * aria du titre et de la description.
 */
export function Modal({ title, description, onClose, size = "md", mobile = "sheet", footer, children }: ModalProps) {
  const dialogRef = useModalFocusTrap<HTMLElement>(onClose);
  const titleId = useId();
  const descriptionId = useId();

  // La page derrière ne doit pas défiler quand on fait défiler la modale :
  // sur iOS en particulier, le doigt entraîne sinon le document entier et on
  // perd sa place dans la liste au moment de fermer.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, []);

  const isSheet = mobile === "sheet";

  return (
    <div
      className={`fixed inset-0 z-[70] flex bg-animeo-deep/60 backdrop-blur-sm ${isSheet ? "items-end sm:items-center" : "items-stretch sm:items-center"} justify-center sm:p-4`}
      role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <section
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        className={`flex w-full flex-col overflow-hidden bg-animeo-surface shadow-[0_24px_70px_rgb(var(--theme-shadow-rgb)/0.3)] outline-none ${sizeClassName[size]} ${
          isSheet
            ? "max-h-[92dvh] rounded-t-[26px] sm:max-h-[90dvh] sm:rounded-[20px]"
            : "h-[100dvh] rounded-none sm:h-auto sm:max-h-[90dvh] sm:rounded-[20px]"
        }`}
      >
        {/* Poignée : signale qu'on est sur une feuille et où la saisir. Purement
            visuelle, la fermeture passe par le bouton et par Échap. */}
        {isSheet ? <div aria-hidden="true" className="mx-auto mt-2.5 h-1.5 w-11 shrink-0 rounded-full bg-animeo-border sm:hidden" /> : null}

        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-animeo-border-soft p-5 sm:p-6">
          <div className="min-w-0">
            <h2 id={titleId} className="truncate text-lg font-black text-animeo-dark">{title}</h2>
            {description ? <p id={descriptionId} className="mt-1 text-sm text-animeo-muted">{description}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-animeo-bg text-xl leading-none text-animeo-muted transition hover:bg-animeo-soft"
          >
            ×
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5 sm:p-6">{children}</div>

        {footer ? (
          // pb calculé : sur les téléphones à barre gestuelle, la dernière
          // rangée d'actions tombe sinon sous la zone tactile du système.
          <footer
            className="flex shrink-0 flex-col-reverse gap-2 border-t border-animeo-border-soft bg-animeo-surface p-5 sm:flex-row sm:justify-end sm:p-6"
            style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
          >
            {footer}
          </footer>
        ) : null}
      </section>
    </div>
  );
}
