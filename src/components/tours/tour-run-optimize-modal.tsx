"use client";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { formatDistanceMeters, formatDurationSeconds } from "@/lib/maps/map-utils";
import type { OptimizationComparison } from "@/lib/tour-runs-actions";

type TourRunOptimizeModalProps = {
  comparison: OptimizationComparison;
  applying: boolean;
  onApply: () => void;
  onDismiss: () => void;
};

export function TourRunOptimizeModal({ comparison, applying, onApply, onDismiss }: TourRunOptimizeModalProps) {
  const gainDistance = comparison.current.distanceMeters - comparison.proposed.distanceMeters;
  const gainDuration = comparison.current.durationSeconds - comparison.proposed.durationSeconds;

  return (
    <Modal
      title="✨ Proposition d’optimisation"
      onClose={onDismiss}
      footer={
        <>
          <Button variant="secondary" onClick={onDismiss}>Garder ma tournée</Button>
          <Button onClick={onApply} disabled={applying}>{applying ? "Application…" : "Appliquer la proposition"}</Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-animeo-bg p-4">
              <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-animeo-muted">Votre tournée</p>
              <p className="mt-2 text-xl font-black text-animeo-dark">{formatDistanceMeters(comparison.current.distanceMeters)}</p>
              <p className="text-sm font-bold text-animeo-muted">{formatDurationSeconds(comparison.current.durationSeconds)} de route</p>
            </div>
            <div className="rounded-2xl bg-animeo-soft p-4">
              <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-animeo-dark">Proposition 1002 Pattes</p>
              <p className="mt-2 text-xl font-black text-animeo-dark">{formatDistanceMeters(comparison.proposed.distanceMeters)}</p>
              <p className="text-sm font-bold text-animeo-dark">{formatDurationSeconds(comparison.proposed.durationSeconds)} de route</p>
            </div>
          </div>

          {gainDistance > 0 || gainDuration > 0 ? (
            <p className="mt-4 rounded-xl bg-animeo-positive-soft px-4 py-3 text-sm font-extrabold text-animeo-hover">
              Gain potentiel : −{formatDistanceMeters(Math.max(gainDistance, 0))} · −{formatDurationSeconds(Math.max(gainDuration, 0))}
            </p>
          ) : (
            <p className="mt-4 rounded-xl bg-animeo-bg px-4 py-3 text-sm font-semibold text-animeo-muted">Votre ordre actuel est déjà optimal ou proche de l’optimum.</p>
          )}

          {comparison.unassigned.length > 0 ? (
            <p className="mt-3 text-xs font-semibold text-animeo-danger">{comparison.unassigned.length} arrêt(s) n’ont pas pu être placés dans la fenêtre horaire disponible et resteront à leur position actuelle.</p>
          ) : null}
            </Modal>
  );
}
