"use client";

import { useModalFocusTrap } from "@/components/ui/use-modal-focus-trap";

type TourRunRemoveStopModalProps = {
  stopLabel: string;
  submitting: boolean;
  onRemoveFromTour: () => void;
  onCancelAppointment: () => void;
  onClose: () => void;
};

/**
 * Phase 3 ter : "retirer un arrêt" et "annuler le rendez-vous" sont deux
 * gestes très différents (l'un garde le rendez-vous à l'agenda, l'autre le
 * supprime) — jamais fusionnés dans un même bouton. N'apparaît que pour un
 * arrêt lié à un rendez-vous ; un arrêt manuel se retire directement (rien
 * à distinguer, pas de rendez-vous derrière).
 */
export function TourRunRemoveStopModal({ stopLabel, submitting, onRemoveFromTour, onCancelAppointment, onClose }: TourRunRemoveStopModalProps) {
  const dialogRef = useModalFocusTrap<HTMLElement>(onClose);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#102f37]/60 p-4 backdrop-blur-sm" role="presentation">
      <section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="remove-stop-title" aria-describedby="remove-stop-message" className="w-full max-w-sm rounded-[18px] bg-white shadow-[0_24px_70px_rgba(12,39,47,0.3)] outline-none">
        <div className="p-6">
          <h2 id="remove-stop-title" className="text-lg font-black text-animeo-dark">Que faire de « {stopLabel} » ?</h2>
          <p id="remove-stop-message" className="mt-2 text-sm leading-relaxed text-animeo-muted">
            Retirer l’arrêt garde le rendez-vous dans l’agenda — seule la tournée l’oublie. Annuler le rendez-vous le supprime complètement.
          </p>
        </div>
        <div className="flex flex-col gap-2 border-t border-[#e5eeeb] p-5">
          <button type="button" onClick={onRemoveFromTour} disabled={submitting} className="rounded-xl bg-animeo px-5 py-2.5 text-sm font-extrabold text-white transition hover:bg-[#459e90] disabled:cursor-not-allowed disabled:opacity-60">
            Retirer de la tournée (garder le rendez-vous)
          </button>
          <button type="button" onClick={onCancelAppointment} disabled={submitting} className="rounded-xl bg-animeo-error px-5 py-2.5 text-sm font-extrabold text-white transition hover:bg-[#c44848] disabled:cursor-not-allowed disabled:opacity-60">
            Annuler le rendez-vous
          </button>
          <button type="button" onClick={onClose} disabled={submitting} className="rounded-xl border border-[#d4e2df] px-5 py-2.5 text-sm font-extrabold text-animeo-dark transition hover:bg-animeo-bg disabled:cursor-not-allowed disabled:opacity-60">
            Ne rien faire
          </button>
        </div>
      </section>
    </div>
  );
}
