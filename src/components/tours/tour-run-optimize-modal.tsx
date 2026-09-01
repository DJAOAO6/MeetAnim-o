"use client";

import { useModalFocusTrap } from "@/components/ui/use-modal-focus-trap";
import { formatDistanceMeters, formatDurationSeconds } from "@/lib/maps/map-utils";
import type { OptimizationComparison } from "@/lib/tour-runs-actions";

type TourRunOptimizeModalProps = {
  comparison: OptimizationComparison;
  applying: boolean;
  onApply: () => void;
  onDismiss: () => void;
};

export function TourRunOptimizeModal({ comparison, applying, onApply, onDismiss }: TourRunOptimizeModalProps) {
  const dialogRef = useModalFocusTrap<HTMLElement>(onDismiss);
  const gainDistance = comparison.current.distanceMeters - comparison.proposed.distanceMeters;
  const gainDuration = comparison.current.durationSeconds - comparison.proposed.durationSeconds;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#102f37]/60 p-4 backdrop-blur-sm" role="presentation">
      <section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="optimize-title" className="w-full max-w-md rounded-[18px] bg-white shadow-[0_24px_70px_rgba(12,39,47,0.3)] outline-none">
        <div className="p-6">
          <h2 id="optimize-title" className="text-lg font-black text-animeo-dark">✨ Proposition d’optimisation</h2>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-animeo-bg p-4">
              <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-animeo-muted">Votre tournée</p>
              <p className="mt-2 text-xl font-black text-animeo-dark">{formatDistanceMeters(comparison.current.distanceMeters)}</p>
              <p className="text-sm font-bold text-animeo-muted">{formatDurationSeconds(comparison.current.durationSeconds)} de route</p>
            </div>
            <div className="rounded-2xl bg-animeo-soft p-4">
              <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-animeo-dark">Proposition Animéo</p>
              <p className="mt-2 text-xl font-black text-animeo-dark">{formatDistanceMeters(comparison.proposed.distanceMeters)}</p>
              <p className="text-sm font-bold text-animeo-dark">{formatDurationSeconds(comparison.proposed.durationSeconds)} de route</p>
            </div>
          </div>

          {gainDistance > 0 || gainDuration > 0 ? (
            <p className="mt-4 rounded-xl bg-[#e4f5ef] px-4 py-3 text-sm font-extrabold text-[#267668]">
              Gain potentiel : −{formatDistanceMeters(Math.max(gainDistance, 0))} · −{formatDurationSeconds(Math.max(gainDuration, 0))}
            </p>
          ) : (
            <p className="mt-4 rounded-xl bg-animeo-bg px-4 py-3 text-sm font-semibold text-animeo-muted">Votre ordre actuel est déjà optimal ou proche de l’optimum.</p>
          )}

          {comparison.unassigned.length > 0 ? (
            <p className="mt-3 text-xs font-semibold text-[#a9573b]">{comparison.unassigned.length} arrêt(s) n’ont pas pu être placés dans la fenêtre horaire disponible et resteront à leur position actuelle.</p>
          ) : null}
        </div>
        <div className="flex flex-col-reverse gap-2 border-t border-[#e5eeeb] p-5 sm:flex-row sm:justify-end">
          <button type="button" onClick={onDismiss} className="rounded-xl border border-[#d4e2df] px-5 py-2.5 text-sm font-extrabold text-animeo-dark transition hover:bg-animeo-bg">Garder ma tournée</button>
          <button type="button" onClick={onApply} disabled={applying} className="rounded-xl bg-animeo px-5 py-2.5 text-sm font-extrabold text-white transition hover:bg-[#459e90] disabled:cursor-not-allowed disabled:opacity-60">
            {applying ? "Application…" : "Appliquer la proposition"}
          </button>
        </div>
      </section>
    </div>
  );
}
