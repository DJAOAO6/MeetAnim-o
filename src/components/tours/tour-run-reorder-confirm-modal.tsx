"use client";

import { useModalFocusTrap } from "@/components/ui/use-modal-focus-trap";
import type { ReorderTimeChange } from "@/lib/tour-runs-actions";

type TourRunReorderConfirmModalProps = {
  changes: ReorderTimeChange[];
  applying: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * Phase 3 ter : un réordonnancement (manuel, ou l'application d'une
 * proposition d'optimisation) qui changerait l'heure d'un ou plusieurs
 * rendez-vous ne s'applique jamais en silence — cette confirmation liste
 * précisément ce qui bougerait avant que quoi que ce soit ne soit écrit.
 */
export function TourRunReorderConfirmModal({ changes, applying, onConfirm, onCancel }: TourRunReorderConfirmModalProps) {
  const dialogRef = useModalFocusTrap<HTMLElement>(onCancel);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#102f37]/60 p-4 backdrop-blur-sm" role="presentation">
      <section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="reorder-confirm-title" className="w-full max-w-md rounded-[18px] bg-white shadow-[0_24px_70px_rgba(12,39,47,0.3)] outline-none">
        <div className="p-6">
          <h2 id="reorder-confirm-title" className="text-lg font-black text-animeo-dark">
            {changes.length > 1 ? `${changes.length} rendez-vous vont changer d'heure` : "1 rendez-vous va changer d'heure"}
          </h2>
          <p className="mt-2 text-sm text-animeo-muted">Ce nouvel ordre décale les heures ci-dessous. Confirmez pour les appliquer aux rendez-vous.</p>

          <ul className="mt-4 space-y-2">
            {changes.map((change) => (
              <li key={change.stopId} className="flex items-center justify-between rounded-xl bg-animeo-bg px-4 py-3">
                <span className="font-extrabold text-animeo-dark">{change.label}</span>
                <span className="text-sm font-bold text-animeo-muted">
                  {change.currentTime} <span aria-hidden="true">→</span> <span className="text-animeo-dark">{change.proposedTime}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex flex-col-reverse gap-2 border-t border-[#e5eeeb] p-5 sm:flex-row sm:justify-end">
          <button type="button" onClick={onCancel} className="rounded-xl border border-[#d4e2df] px-5 py-2.5 text-sm font-extrabold text-animeo-dark transition hover:bg-animeo-bg">Annuler</button>
          <button type="button" onClick={onConfirm} disabled={applying} className="rounded-xl bg-animeo px-5 py-2.5 text-sm font-extrabold text-white transition hover:bg-[#459e90] disabled:cursor-not-allowed disabled:opacity-60">
            {applying ? "Application…" : "Confirmer les nouveaux horaires"}
          </button>
        </div>
      </section>
    </div>
  );
}
