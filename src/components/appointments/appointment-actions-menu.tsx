"use client";

import { useEffect, useRef, useState } from "react";
import {
  CalendarCheck,
  CheckCircle,
  Copy,
  MoreHorizontal,
  PawPrint,
  Pencil,
  User,
  XCircle,
} from "lucide-react";
import type { Appointment } from "@/data/appointments";

export type AppointmentAction =
  | "edit"
  | "confirm"
  | "complete"
  | "cancel"
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
  { action: "edit", label: "Modifier", icon: Pencil, available: () => true },
  { action: "confirm", label: "Marquer comme confirmé", icon: CalendarCheck, available: (appointment) => appointment.status === "pending" },
  { action: "complete", label: "Marquer comme terminé", icon: CheckCircle, available: (appointment) => appointment.status === "confirmed" },
  { action: "duplicate", label: "Dupliquer", icon: Copy, available: () => true },
  { action: "openClient", label: "Voir la fiche client", icon: User, available: (appointment) => Boolean(appointment.clientId) },
  { action: "openAnimal", label: "Voir la fiche animal", icon: PawPrint, available: (appointment) => Boolean(appointment.clientId && appointment.animalId) },
  { action: "cancel", label: "Annuler le rendez-vous", icon: XCircle, destructive: true, available: (appointment) => appointment.status !== "cancelled" },
];

/**
 * Menu d'actions d'une ligne de rendez-vous.
 *
 * Pas de suppression définitive : un rendez-vous passé fait partie de
 * l'historique du client et de l'animal, et sert aux statistiques. « Annuler »
 * conserve la trace, ce que la suppression ne permettrait pas — c'est déjà le
 * choix fait ailleurs dans le logiciel, on ne l'inverse pas ici.
 */
export function AppointmentActionsMenu({ appointment, onAction }: {
  appointment: Appointment;
  onAction: (action: AppointmentAction) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      // Échap referme le menu sans refermer la fenêtre qui le contient.
      if (event.key === "Escape") { event.stopPropagation(); setOpen(false); }
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [open]);

  const visible = entries.filter((entry) => entry.available(appointment));

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Actions pour le rendez-vous de ${appointment.animalName} à ${appointment.start}`}
        className="flex h-9 w-9 items-center justify-center rounded-xl text-animeo-muted transition hover:bg-animeo-bg hover:text-animeo-dark"
      >
        <MoreHorizontal aria-hidden="true" className="h-4 w-4" />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+4px)] z-20 w-60 rounded-2xl border border-animeo-border bg-white p-1.5 shadow-[0_16px_40px_rgb(var(--theme-shadow-rgb)/0.18)]"
        >
          {visible.map((entry) => {
            const EntryIcon = entry.icon;
            return (
              <button
                key={entry.action}
                type="button"
                role="menuitem"
                onClick={() => { setOpen(false); onAction(entry.action); }}
                className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-bold transition ${
                  entry.destructive
                    ? "mt-1 border-t border-animeo-border-soft pt-3 text-animeo-danger hover:bg-animeo-danger-soft"
                    : "text-animeo-dark hover:bg-animeo-bg"
                }`}
              >
                <EntryIcon aria-hidden="true" className="h-4 w-4 shrink-0" />
                {entry.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
