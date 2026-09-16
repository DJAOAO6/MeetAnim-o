"use client";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

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

  return (
    <Modal
      title={`Que faire de « ${stopLabel} » ?`}
      description="Retirer l’arrêt garde le rendez-vous dans l’agenda — seule la tournée l’oublie. Annuler le rendez-vous le supprime complètement."
      onClose={onClose}
      size="sm"
      footer={
        // Trois issues d'importance décroissante, empilées : sur un choix qui
        // engage (annuler un rendez-vous), une rangée horizontale inviterait à
        // cliquer vite.
        <div className="flex w-full flex-col gap-2">
          <Button onClick={onRemoveFromTour} disabled={submitting}>Retirer de la tournée (garder le rendez-vous)</Button>
          <Button variant="danger" onClick={onCancelAppointment} disabled={submitting}>Annuler le rendez-vous</Button>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>Ne rien faire</Button>
        </div>
      }
    >
      <p className="text-sm leading-relaxed text-animeo-muted">
        Ce choix ne concerne que cet arrêt de la tournée.
      </p>
    </Modal>
  );
}
