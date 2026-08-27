"use client";

import { getMockDayAgenda } from "@/data/agenda-mock";
import { Icon } from "@/components/ui/icon";
import type { AvailabilitySettings } from "@/data/settings";

type DayDetailPanelProps = {
  date: Date;
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

export function DayDetailPanel({ date, availability, onClose, onViewDay }: DayDetailPanelProps) {
  const agenda = getMockDayAgenda(date, availability);
  const appointments = agenda.items.filter((item) => item.kind !== "tournee");
  const domicileCount = agenda.items.filter((item) => item.kind === "domicile").length;
  const tourCount = agenda.items.filter((item) => item.kind === "tournee").length;
  const estimatedKm = domicileCount * 8;
  const totalMinutes = appointments.length * 60;

  return (
    <div className="rounded-2xl border border-[#e5eae9] bg-white p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.13em] text-animeo">Détail du jour</p>
          <h3 className="mt-1 text-sm font-black text-animeo-dark">{formatDayTitle(date)}</h3>
          <p className="mt-0.5 text-xs font-bold text-animeo-muted">
            {agenda.isClosed ? "Journée fermée" : `${agenda.count} rendez-vous`}
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label="Fermer le détail du jour" className="shrink-0 text-lg leading-none text-animeo-muted hover:text-animeo-dark">×</button>
      </div>

      {agenda.isClosed ? (
        <p className="mt-4 text-sm text-animeo-muted">Aucun rendez-vous : le cabinet est fermé ce jour-là.</p>
      ) : agenda.items.length === 0 ? (
        <p className="mt-4 text-sm text-animeo-muted">Aucun rendez-vous prévu ce jour-là.</p>
      ) : (
        <>
          <ul className="mt-3 flex flex-col gap-2.5">
            {agenda.items.map((item) => (
              <li key={item.id} className="border-l-2 border-[#e5eae9] pl-2.5">
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
            {appointments.length > 0 ? <span className="col-span-2">{formatDuration(totalMinutes)} de consultations</span> : null}
          </div>
        </>
      )}

      <button
        type="button"
        onClick={onViewDay}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-[#d9e5e2] bg-white px-4 py-2.5 text-sm font-extrabold text-animeo-dark transition hover:border-animeo hover:text-animeo"
      >
        <Icon name="calendar" className="h-4 w-4" />
        Voir la journée
      </button>
    </div>
  );
}
