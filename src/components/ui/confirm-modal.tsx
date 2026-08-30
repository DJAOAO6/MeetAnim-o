"use client";

import { useModalFocusTrap } from "@/components/ui/use-modal-focus-trap";

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
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#102f37]/60 p-4 backdrop-blur-sm" role="presentation">
      <section
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
        className="w-full max-w-sm rounded-[18px] bg-white shadow-[0_24px_70px_rgba(12,39,47,0.3)] outline-none"
      >
        <div className="p-6">
          <h2 id="confirm-dialog-title" className="text-lg font-black text-animeo-dark">{title}</h2>
          <p id="confirm-dialog-message" className="mt-2 text-sm leading-relaxed text-animeo-muted">{message}</p>
        </div>
        <div className="flex flex-col-reverse gap-2 border-t border-[#e5eeeb] p-5 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} className="rounded-xl border border-[#d4e2df] px-5 py-2.5 text-sm font-extrabold text-animeo-dark transition hover:bg-animeo-bg">
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`rounded-xl px-5 py-2.5 text-sm font-extrabold text-white transition ${destructive ? "bg-animeo-error hover:bg-[#c44848]" : "bg-animeo hover:bg-[#459e90]"}`}
          >
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
