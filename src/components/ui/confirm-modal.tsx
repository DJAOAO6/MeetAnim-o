"use client";

import { useModalFocusTrap } from "@/components/ui/use-modal-focus-trap";
import { OverlayPortal } from "@/components/ui/overlay-portal";
import { Button } from "@/components/ui/button";

type ConfirmModalProps = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onClose: () => void;
};

/**
 * Confirmation générique pour toute action difficile à annuler (déconnexion,
 * suppression) — remplace window.confirm() par une vraie modale cohérente
 * avec le reste de l'app (piège de focus, Échap, style de marque).
 */
export function ConfirmModal({ title, message, confirmLabel = "Confirmer", cancelLabel = "Annuler", destructive = true, onConfirm, onClose }: ConfirmModalProps) {
  const dialogRef = useModalFocusTrap<HTMLElement>(onClose);

  return (
    <OverlayPortal>
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-animeo-deep/60 p-4 backdrop-blur-sm" role="presentation">
        <section
          ref={dialogRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-dialog-title"
          aria-describedby="confirm-dialog-message"
          className="w-full max-w-sm rounded-[18px] bg-animeo-surface shadow-[0_24px_70px_rgb(var(--theme-shadow-rgb)/0.3)] outline-none"
        >
          <div className="p-6">
            <h2 id="confirm-dialog-title" className="text-lg font-black text-animeo-dark">{title}</h2>
            <p id="confirm-dialog-message" className="mt-2 text-sm leading-relaxed text-animeo-muted">{message}</p>
          </div>
          <div className="flex flex-col-reverse gap-2 border-t border-animeo-border-soft p-5 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={onClose}>{cancelLabel}</Button>
            {/* Le rouge plein n'existe qu'ici : dans la page, supprimer reste discret. */}
            <Button type="button" variant={destructive ? "dangerSolid" : "primary"} onClick={onConfirm}>{confirmLabel}</Button>
          </div>
        </section>
      </div>
    </OverlayPortal>
  );
}
