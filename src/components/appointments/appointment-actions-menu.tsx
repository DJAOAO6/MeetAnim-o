"use client";

import {
  CalendarCheck,
  CalendarClock,
  CheckCircle,
  Copy,
  PawPrint,
  Pencil,
  User,
  XCircle,
} from "lucide-react";
import { ActionMenuButton } from "@/components/ui/action-menu";
import type { Appointment } from "@/data/appointments";

export type AppointmentAction =
  | "edit"
  | "confirm"
  | "complete"
  | "absent"
  | "cancel"
  | "decline"
  | "reschedule"
  | "duplicate"
  | "openClient"
  | "openAnimal";

type MenuEntry = {
  action: AppointmentAction;
  label: string;
  icon: typeof Pencil;
  /** Séparé visuellement : ce qui modifie l'état du rendez-vous. */
  destructive?: boolean;
  available: (appointment: Appointment) => boolean;
};

/**
 * Les actions proposées dépendent de l'état réel du rendez-vous : proposer
 * « Marquer comme confirmé » sur un rendez-vous déjà confirmé, ou « Annuler »
 * sur un rendez-vous annulé, donne un menu qui ne veut rien dire et des clics
 * sans effet.
 *
 * « Voir la fiche client » n'apparaît que si le rendez-vous est rattaché à une
 * fiche : un rendez-vous peut avoir été saisi avec un simple nom.
 */
const entries: MenuEntry[] = [
  // Plusieurs horaires proposés (C8) : on en retient un dans la fiche, pas d'acceptation d'un bloc.
  { action: "confirm", label: "Accepter la demande", icon: CalendarCheck, available: (appointment) => appointment.status === "pending" && (appointment.slotOptions?.length ?? 0) <= 1 },
  { action: "reschedule", label: "Proposer un autre horaire", icon: CalendarClock, available: (appointment) => appointment.status === "pending" },
  { action: "edit", label: "Modifier", icon: Pencil, available: (appointment) => appointment.status !== "pending" },
  { action: "complete", label: "Marquer comme terminé", icon: CheckCircle, available: (appointment) => appointment.status === "confirmed" },
  { action: "duplicate", label: "Dupliquer", icon: Copy, available: () => true },
  { action: "openClient", label: "Voir la fiche client", icon: User, available: (appointment) => Boolean(appointment.clientId) },
  { action: "openAnimal", label: "Voir la fiche animal", icon: PawPrint, available: (appointment) => Boolean(appointment.clientId && appointment.animalId) },
  { action: "decline", label: "Refuser la demande", icon: XCircle, destructive: true, available: (appointment) => appointment.status === "pending" },
  { action: "cancel", label: "Annuler le rendez-vous", icon: XCircle, destructive: true, available: (appointment) => appointment.status === "confirmed" },
  // Réalisé à tort (client absent), à la main ou automatiquement : la consultation est retirée.
  { action: "absent", label: "Client absent — annuler", icon: XCircle, destructive: true, available: (appointment) => appointment.status === "completed" },
];

/**
 * Menu d'actions d'une ligne de rendez-vous.
 *
 * Pas de suppression définitive : un rendez-vous passé fait partie de
 * l'historique du client et de l'animal, et sert aux statistiques. « Annuler »
 * conserve la trace, ce que la suppression ne permettrait pas — c'est déjà le
 * choix fait ailleurs dans le logiciel, on ne l'inverse pas ici.
 *
 * Le menu lui-même est celui de tout le produit (`ActionMenuButton`) : il
 * s'ouvre vers le haut en bas d'une liste qui défile, et en feuille basse sur
 * téléphone.
 */
export function AppointmentActionsMenu({ appointment, onAction }: {
  appointment: Appointment;
  onAction: (action: AppointmentAction) => void;
}) {
  const items = entries
    .filter((entry) => entry.available(appointment))
    .map((entry) => {
      const EntryIcon = entry.icon;
      return { label: entry.label, icon: <EntryIcon aria-hidden="true" className="h-4 w-4 shrink-0" />, destructive: entry.destructive, onSelect: () => onAction(entry.action) };
    });

  return (
    <ActionMenuButton
      label={`Actions pour le rendez-vous de ${appointment.animalName} à ${appointment.start}`}
      sheetTitle={`${appointment.animalName} · ${appointment.start}`}
      items={items}
    />
  );
}
