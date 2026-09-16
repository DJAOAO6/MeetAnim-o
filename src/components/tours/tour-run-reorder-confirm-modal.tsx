"use client";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
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

  return (
    <Modal
      title={changes.length > 1 ? `${changes.length} rendez-vous vont changer d'heure` : "1 rendez-vous va changer d'heure"}
      description="Ce nouvel ordre décale les heures ci-dessous. Confirmez pour les appliquer aux rendez-vous."
      onClose={onCancel}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>Annuler</Button>
          <Button onClick={onConfirm} disabled={applying}>
            {applying ? "Application…" : "Confirmer les nouveaux horaires"}
          </Button>
        </>
      }
    >
      <ul className="space-y-2">
        {changes.map((change) => (
          <li key={change.stopId} className="flex items-center justify-between gap-3 rounded-xl bg-animeo-bg px-4 py-3">
            <span className="min-w-0 truncate font-extrabold text-animeo-dark">{change.label}</span>
            <span className="shrink-0 text-sm font-bold text-animeo-muted">
              {change.currentTime} <span aria-hidden="true">→</span> <span className="text-animeo-dark">{change.proposedTime}</span>
            </span>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
