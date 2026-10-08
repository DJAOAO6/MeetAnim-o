"use client";

import { getDayAgenda } from "@/lib/agenda-aggregation";
import { Button } from "@/components/ui/button";
import { CloseButton } from "@/components/ui/close-button";
import { Icon } from "@/components/ui/icon";
import type { Appointment } from "@/data/appointments";
import type { AvailabilitySettings } from "@/data/settings";
import type { Tour } from "@/data/tours";

type DayDetailPanelProps = {
  date: Date;
  appointments: Appointment[];
  tours: Tour[];
  availability: AvailabilitySettings;
  onClose: () => void;
  onViewDay: () => void;
};

const dateFormatter = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

function formatDayTitle(date: Date) {
  const label = dateFormatter.format(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function formatDuration(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} min`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h${String(minutes).padStart(2, "0")}`;
}

const kindLabel: Record<string, string> = {
  cabinet: "Cabinet",
  domicile: "Domicile",
  pending: "En attente",
};

export function DayDetailPanel({ date, appointments: allAppointments, tours, availability, onClose, onViewDay }: DayDetailPanelProps) {
  const agenda = getDayAgenda(date, allAppointments, tours, availability);
  const dayAppointments = agenda.items.filter((item) => item.kind !== "tournee");
  const domicileCount = agenda.items.filter((item) => item.kind === "domicile").length;
  const tourCount = agenda.items.filter((item) => item.kind === "tournee").length;
  const estimatedKm = domicileCount * 8;
  const totalMinutes = dayAppointments.reduce((sum, item) => sum + item.duration, 0);

  return (
    <div className="rounded-2xl border border-animeo-border-soft bg-white p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.13em] text-animeo">Détail du jour</p>
          <h3 className="mt-1 text-sm font-black text-animeo-dark">{formatDayTitle(date)}</h3>
          <p className="mt-0.5 text-xs font-bold text-animeo-muted">
            {agenda.isClosed ? "Journée fermée" : `${agenda.count} rendez-vous`}
          </p>
        </div>
        <CloseButton onClick={onClose} label="Fermer le détail du jour" className="-mr-1 -mt-1" />
      </div>

      {agenda.isClosed ? (
        <p className="mt-4 text-sm text-animeo-muted">Aucun rendez-vous : le cabinet est fermé ce jour-là.</p>
      ) : agenda.items.length === 0 ? (
        <p className="mt-4 text-sm text-animeo-muted">Aucun rendez-vous prévu ce jour-là.</p>
      ) : (
        <>
          <ul className="mt-3 flex flex-col gap-2.5">
            {agenda.items.map((item) => (
              <li key={item.id} className="border-l-2 border-animeo-border-soft pl-2.5">
                <p className="text-xs font-black text-animeo-dark">{item.start}</p>
                <p className="text-sm font-extrabold text-animeo-dark">{item.title}</p>
                <p className="text-xs text-animeo-muted">
                  {item.kind === "tournee" ? item.subtitle : `${item.subtitle}${kindLabel[item.kind] ? ` · ${kindLabel[item.kind]}` : ""}`}
                </p>
              </li>
            ))}
          </ul>

          <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-1.5 rounded-xl bg-animeo-bg p-3 text-xs font-bold text-animeo-dark">
            <span>{agenda.count} rendez-vous</span>
            <span>{domicileCount} à domicile</span>
            {tourCount > 0 ? <span>{tourCount} tournée{tourCount > 1 ? "s" : ""}</span> : <span />}
            {domicileCount > 0 ? <span>{estimatedKm} km estimés</span> : <span />}
            {dayAppointments.length > 0 ? <span className="col-span-2">{formatDuration(totalMinutes)} de consultations</span> : null}
          </div>
        </>
      )}

      <Button type="button" variant="secondary" onClick={onViewDay} icon={<Icon name="calendar" className="h-4 w-4" />} className="mt-4 w-full">
        Voir la journée
      </Button>
    </div>
  );
}
