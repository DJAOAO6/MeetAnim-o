"use client";

import { Building2, Car, CalendarDays, PawPrint } from "lucide-react";
import { appointmentStatusLabels, type Appointment } from "@/data/appointments";
import { statusTone } from "@/components/appointments/appointment-status";
import { AppointmentActionsMenu, type AppointmentAction } from "@/components/appointments/appointment-actions-menu";
import { formatEuros } from "@/lib/format";
import { minutesToTime, timeToMinutes } from "@/lib/booking-validation";

/**
 * Liste des rendez-vous.
 *
 * Une ligne compacte, pas une carte : l'ancienne version mettait quatre
 * rendez-vous sur un écran, avec autant de vide que d'information. Ici, tout
 * ce qu'on cherche d'un coup d'œil — heure, animal, client, prestation, lieu,
 * statut — tient sur une ligne, et une quinzaine de rendez-vous se parcourent
 * sans défiler.
 *
 * La même liste sert au grand écran et au téléphone : les colonnes de droite
 * passent sous le nom quand la place manque, plutôt qu'un tableau comprimé.
 */
export function AppointmentList({ appointments, selectedId, onSelect, onAction }: {
  appointments: Appointment[];
  selectedId: string | null;
  onSelect: (appointment: Appointment) => void;
  onAction: (action: AppointmentAction, appointment: Appointment) => void;
}) {
  return (
    <ul className="grid gap-1.5">
      {appointments.map((appointment) => (
        <li key={appointment.id}>
          <AppointmentRow
            appointment={appointment}
            selected={appointment.id === selectedId}
            onSelect={() => onSelect(appointment)}
            onAction={(action) => onAction(action, appointment)}
          />
        </li>
      ))}
    </ul>
  );
}

export function AppointmentRow({ appointment, selected, onSelect, onAction }: {
  appointment: Appointment;
  selected: boolean;
  onSelect: () => void;
  onAction: (action: AppointmentAction) => void;
}) {
  const tone = statusTone(appointment.status);
  const end = minutesToTime(timeToMinutes(appointment.start) + appointment.duration);
  const PlaceIcon = appointment.mode === "cabinet" ? Building2 : Car;

  return (
    <div
      className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 transition ${
        selected ? "border-animeo bg-animeo-soft" : "border-animeo-border bg-white hover:border-animeo-border-strong"
      } ${appointment.status === "cancelled" ? "opacity-70" : ""}`}
    >
      {/* Le bouton porte toute la ligne sauf le menu : cliquer n'importe où
          ouvre le détail, ce qui est le geste attendu dans une liste. */}
      <button
        type="button"
        onClick={onSelect}
        aria-current={selected ? "true" : undefined}
        className="flex min-w-0 flex-1 items-center gap-3 text-left outline-none focus-visible:rounded-lg focus-visible:ring-2 focus-visible:ring-animeo-dark"
      >
        <span className="w-14 shrink-0">
          <span className="block text-sm font-black tabular-nums text-animeo-dark">{appointment.start}</span>
          <span className="block text-[11px] tabular-nums text-animeo-muted">{end}</span>
        </span>

        <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-animeo-soft text-animeo-dark">
          <PawPrint className="h-4 w-4" />
        </span>

        <span className="min-w-0 flex-[2]">
          <span className="block truncate text-sm font-extrabold text-animeo-dark">{appointment.animalName}</span>
          <span className="block truncate text-xs text-animeo-muted">{appointment.clientName}</span>
        </span>

        <span className="hidden min-w-0 flex-[2] sm:block">
          <span className="block truncate text-sm font-bold text-animeo-dark">{appointment.serviceName}</span>
          <span className="block truncate text-xs text-animeo-muted">{appointment.duration} min · {formatEuros(appointment.price)}</span>
        </span>

        <span className="hidden w-24 shrink-0 items-center gap-1.5 text-xs font-bold text-animeo-muted lg:flex">
          <PlaceIcon aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{appointment.mode === "cabinet" ? "Cabinet" : "Domicile"}</span>
        </span>

        <span className={`hidden shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-extrabold sm:inline-flex ${tone.chip}`}>
          <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
          {appointmentStatusLabels[appointment.status]}
        </span>
      </button>

      <AppointmentActionsMenu appointment={appointment} onAction={onAction} />
    </div>
  );
}

/**
 * Regroupement par jour. La liste couvre souvent plusieurs jours : sans
 * séparateur daté, deux « 09:00 » qui se suivent ne veulent rien dire.
 */
export function AppointmentDayGroup({ dateId, count, children }: { dateId: string; count: number; children: React.ReactNode }) {
  return (
    <section className="grid gap-1.5">
      <h3 className="flex items-center gap-2 px-1 pt-1 text-xs font-extrabold uppercase tracking-[0.1em] text-animeo-muted">
        <CalendarDays aria-hidden="true" className="h-3.5 w-3.5" />
        <span className="capitalize">{formatDayLabel(dateId)}</span>
        <span className="font-bold normal-case tracking-normal">· {count} rendez-vous</span>
      </h3>
      {children}
    </section>
  );
}

function formatDayLabel(dateId: string): string {
  const [year, month, day] = dateId.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" }).format(new Date(year, month - 1, day, 12));
}
