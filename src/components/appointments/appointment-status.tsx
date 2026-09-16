"use client";

import type { AppointmentStatus } from "@/data/appointments";

/**
 * Teintes des quatre statuts, définies une seule fois : le formulaire,
 * l'aperçu, la liste de gestion et la fiche détaillée doivent donner la même
 * couleur au même statut, sinon on doute de ce qu'on lit.
 *
 * La couleur ne porte jamais l'information seule — partout où ces classes
 * sont utilisées, le libellé du statut est écrit à côté.
 */
export function statusTone(status: AppointmentStatus): { chip: string; dot: string } {
  switch (status) {
    case "pending":
      return { chip: "bg-animeo-warning-soft text-animeo-warning", dot: "bg-animeo-accent" };
    case "confirmed":
      return { chip: "bg-animeo-positive-soft text-animeo-positive", dot: "bg-animeo-positive" };
    case "completed":
      return { chip: "bg-animeo-info-soft text-animeo-dark", dot: "bg-animeo-dark" };
    case "cancelled":
      return { chip: "bg-animeo-danger-soft text-animeo-danger", dot: "bg-animeo-danger" };
  }
}
