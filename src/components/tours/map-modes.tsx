"use client";

import Link from "next/link";
import { Building2, CalendarClock, House, Navigation, Route, UserRound } from "lucide-react";
import { Fragment, useEffect, useRef } from "react";
import { useAppointments } from "@/components/appointments/appointments-context";
import { dayHeading, MAP_MODES, type MapMode, type ZoneFilter } from "@/lib/map-modes";
import type { MapAppointment } from "@/data/map-clients";
import type { PublicZone } from "@/data/public-booking";

/** Tournée active qui a encore une date à venir (mode « Tournées »). */
export type PlannedTour = {
  id: string;
  name: string;
  zoneIds: string[];
  nextOccurrenceLabel: string;
  startTime: string;
  endTime: string;
};

const statusLabels: Record<MapAppointment["status"], string> = { PENDING: "En attente", CONFIRMED: "Confirmé", COMPLETED: "Réalisé" };
export const appointmentStatusColors: Record<MapAppointment["status"], string> = {
  CONFIRMED: "var(--theme-brand)",
  PENDING: "var(--theme-subtle)",
  COMPLETED: "var(--theme-success)",
};
export const APPOINTMENT_LEGEND = (["CONFIRMED", "PENDING", "COMPLETED"] as const).map((status) => ({ color: appointmentStatusColors[status], label: statusLabels[status] }));

export function appointmentTitle(appointment: MapAppointment, todayId: string): string {
  const animal = appointment.animalName ? ` · ${appointment.animalName}` : "";
  return `${dayHeading(appointment.dateId, todayId)} ${appointment.start} · ${appointment.clientName}${animal} · ${appointment.city || "commune inconnue"} · ${appointment.place === "home" ? "Domicile" : "Cabinet"} · ${statusLabels[appointment.status].toLowerCase()}`;
}

/** Contrôle segmenté compact, partagé par les modes et leurs options. */
export function Segmented<T extends string>({ label, options, value, onChange, size = "md" }: {
  label: string;
  options: ReadonlyArray<{ id: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
  size?: "md" | "sm";
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex max-w-full overflow-x-auto rounded-xl bg-animeo-bg p-1">
      {options.map((option) => {
        const active = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.id)}
            className={`shrink-0 rounded-lg font-extrabold transition ${size === "md" ? "min-h-9 px-3 text-xs" : "min-h-8 px-2.5 text-[11px]"} ${active ? "bg-white text-animeo-dark shadow-sm" : "text-animeo-muted hover:text-animeo-dark"}`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function MapModeSwitcher({ mode, onChange }: { mode: MapMode; onChange: (mode: MapMode) => void }) {
  return <Segmented label="Mode de la carte" options={MAP_MODES} value={mode} onChange={onChange} />;
}

/** Actions d'un rendez-vous : l'ouvrir, la fiche du client, l'itinéraire (seulement celles possibles). */
function AppointmentActions({ appointment }: { appointment: MapAppointment }) {
  const { openManager } = useAppointments();
  const action = "flex min-h-11 flex-col items-center justify-center gap-1 rounded-xl border border-animeo-border bg-white px-1 text-[11px] font-extrabold text-animeo-dark transition hover:bg-animeo-bg";
  return (
    <div className="grid grid-cols-3 gap-1.5">
      <button type="button" onClick={() => openManager(appointment.id)} className={action}>
        <CalendarClock aria-hidden="true" className="h-4 w-4" />Voir le RDV
      </button>
      {appointment.clientId ? (
        <Link href={`/dashboard/clients/${appointment.clientId}`} className={action}>
          <UserRound aria-hidden="true" className="h-4 w-4" />Fiche client
        </Link>
      ) : null}
      {appointment.coordinates ? (
        <a href={`https://www.google.com/maps/dir/?api=1&destination=${appointment.coordinates.lat},${appointment.coordinates.lng}`} target="_blank" rel="noopener noreferrer" className={action}>
          <Navigation aria-hidden="true" className="h-4 w-4" />Itinéraire
        </a>
      ) : null}
    </div>
  );
}

/** Fiche d'un rendez-vous choisi sur la carte (flottante, ou rangée sous la carte sur téléphone). */
export function MapAppointmentCard({ appointment, todayId, onClose, docked = false }: { appointment: MapAppointment; todayId: string; onClose: () => void; docked?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 ${docked ? "border-animeo-border bg-white" : "border-white/70 bg-white/95 shadow-[0_12px_30px_rgb(var(--theme-shadow-rgb)/0.18)] backdrop-blur-sm"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-extrabold text-animeo">{dayHeading(appointment.dateId, todayId)} · {appointment.start}</p>
          <p className="mt-1 truncate font-extrabold text-animeo-dark">{appointment.clientName}{appointment.animalName ? ` · ${appointment.animalName}` : ""}</p>
          <p className="mt-0.5 truncate text-xs font-bold text-animeo-muted">{appointment.serviceName}</p>
        </div>
        <button type="button" onClick={onClose} aria-label={`Fermer le rendez-vous de ${appointment.clientName}`} className="-mr-1.5 -mt-1.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-lg text-animeo-muted transition hover:bg-animeo-bg hover:text-animeo-dark">×</button>
      </div>
      <p className="mt-2 flex items-center gap-1.5 text-xs font-bold text-animeo-dark">
        {appointment.place === "home" ? <House aria-hidden="true" className="h-3.5 w-3.5 text-animeo-muted" /> : <Building2 aria-hidden="true" className="h-3.5 w-3.5 text-animeo-muted" />}
        {appointment.place === "home" ? "Domicile" : "Cabinet"}{appointment.city ? ` · ${appointment.city}` : ""}
        <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] text-animeo-muted">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: appointmentStatusColors[appointment.status] }} />
          {statusLabels[appointment.status]}
        </span>
      </p>
      <div className="mt-3"><AppointmentActions appointment={appointment} /></div>
    </div>
  );
}

/**
 * Liste du mode « Activité », jour par jour. Un rendez-vous sans point sur
 * la carte (cabinet, domicile non localisé) garde ses actions dans la liste.
 */
export function MapAppointmentList({ appointments, todayId, selectedId, onSelect, hoveredId, onHover }: {
  appointments: MapAppointment[];
  todayId: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
  hoveredId: string | null;
  onHover: (id: string | null) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const list = listRef.current;
    if (!selectedId || !list) return;
    const row = list.querySelector<HTMLElement>(`[data-appointment-row="${CSS.escape(selectedId)}"]`);
    if (!row) return;
    const rowTop = row.getBoundingClientRect().top - list.getBoundingClientRect().top + list.scrollTop;
    if (rowTop < list.scrollTop) list.scrollTop = rowTop;
    else if (rowTop + row.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = rowTop + row.offsetHeight - list.clientHeight;
  }, [selectedId]);

  if (appointments.length === 0) {
    return (
      <div className="p-8 text-center">
        <CalendarClock aria-hidden="true" className="mx-auto h-8 w-8 text-animeo-muted" />
        <p className="mt-3 text-sm font-bold text-animeo-muted">Aucun rendez-vous sur cette période.</p>
      </div>
    );
  }

  return (
    <div ref={listRef} data-testid="map-appointment-list" className="relative max-h-[650px] overflow-y-auto">
      {appointments.map((appointment, index) => {
        const newDay = index === 0 || appointments[index - 1].dateId !== appointment.dateId;
        const selected = appointment.id === selectedId;
        return (
          <Fragment key={appointment.id}>
            {newDay ? <p className="sticky top-0 z-10 bg-animeo-bg px-5 py-2 text-[11px] font-extrabold text-animeo-muted">{dayHeading(appointment.dateId, todayId)}</p> : null}
            <div
              data-appointment-row={appointment.id}
              onMouseEnter={() => onHover(appointment.id)}
              onMouseLeave={() => onHover(null)}
              className={`border-b border-animeo-border-soft ${selected ? "bg-animeo-soft" : hoveredId === appointment.id ? "bg-animeo-bg" : ""}`}
            >
              <button type="button" onClick={() => onSelect(appointment.id)} aria-current={selected ? "true" : undefined} className="flex w-full items-start gap-3 px-5 py-3 text-left">
                <span className="w-11 shrink-0 pt-0.5 text-sm font-extrabold tabular-nums text-animeo-dark">{appointment.start}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-extrabold text-animeo-dark">{appointment.clientName}{appointment.animalName ? ` · ${appointment.animalName}` : ""}</span>
                  <span className="mt-0.5 flex items-center gap-1.5 truncate text-xs font-bold text-animeo-muted">
                    {appointment.city || "Commune inconnue"} · {appointment.place === "home" ? "Domicile" : "Cabinet"}
                    {appointment.status === "PENDING" ? <span className="font-bold text-animeo-dark">· En attente</span> : null}
                    {appointment.place === "home" && !appointment.coordinates ? <span className="font-bold text-animeo-danger">· Position inconnue</span> : null}
                  </span>
                </span>
                <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: appointmentStatusColors[appointment.status] }} title={statusLabels[appointment.status]} />
              </button>
              {selected && !appointment.coordinates ? <div className="px-5 pb-3"><AppointmentActions appointment={appointment} /></div> : null}
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}

/**
 * Mode « Tournées » : comprendre et choisir, pas organiser — les tournées se
 * préparent dans le module Tournées, vers lequel ce panneau renvoie.
 */
export function ToursPanel({ zones, plannedTours, zoneCounts, unattachedCount, totalCount, filter, onFilter }: {
  zones: PublicZone[];
  plannedTours: PlannedTour[];
  zoneCounts: Record<string, number>;
  unattachedCount: number;
  totalCount: number;
  filter: ZoneFilter | null;
  onFilter: (filter: ZoneFilter | null) => void;
}) {
  const chip = (active: boolean) => `inline-flex min-h-9 items-center gap-1.5 rounded-xl px-3 text-xs font-extrabold transition ${active ? "bg-animeo-dark text-white" : "bg-animeo-bg text-animeo-muted hover:text-animeo-dark"}`;
  const zoneNames = (ids: string[]) => ids.map((id) => zones.find((zone) => zone.id === id)?.name).filter(Boolean).join(", ");
  return (
    <div className="space-y-4 border-b border-animeo-border-soft px-5 py-4" data-testid="map-tours-panel">
      <section>
        <h3 className="text-[11px] font-extrabold uppercase tracking-wide text-animeo-muted">Tournées prévues</h3>
        {plannedTours.length > 0 ? (
          <ul className="mt-2 space-y-1.5">
            {plannedTours.map((tour) => {
              const active = filter?.kind === "tour" && filter.id === tour.id;
              return (
                <li key={tour.id}>
                  <button
                    type="button"
                    aria-pressed={active}
                    onClick={() => onFilter(active ? null : { kind: "tour", id: tour.id })}
                    className={`flex w-full items-start gap-2.5 rounded-xl border px-3 py-2 text-left transition ${active ? "border-animeo bg-animeo-soft" : "border-animeo-border hover:bg-animeo-bg"}`}
                  >
                    <Route aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-animeo" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-extrabold text-animeo-dark">{tour.name}</span>
                      <span className="block truncate text-xs font-bold text-animeo-muted">{tour.nextOccurrenceLabel} · {tour.startTime}–{tour.endTime}</span>
                      {zoneNames(tour.zoneIds) ? <span className="block truncate text-[11px] text-animeo-muted">{zoneNames(tour.zoneIds)}</span> : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : <p className="mt-2 text-xs text-animeo-muted">Aucune tournée planifiée.</p>}
      </section>

      <section>
        <h3 className="text-[11px] font-extrabold uppercase tracking-wide text-animeo-muted">Zones</h3>
        <div role="group" aria-label="Filtrer par zone" className="mt-2 flex flex-wrap gap-1.5">
          <button type="button" aria-pressed={filter === null} onClick={() => onFilter(null)} className={chip(filter === null)}>Tous · {totalCount}</button>
          {zones.map((zone) => {
            const active = filter?.kind === "zone" && filter.id === zone.id;
            return (
              <button key={zone.id} type="button" aria-pressed={active} onClick={() => onFilter(active ? null : { kind: "zone", id: zone.id })} className={chip(active)}>
                {zone.name} · {zoneCounts[zone.id] ?? 0}
              </button>
            );
          })}
          <button type="button" aria-pressed={filter?.kind === "none"} onClick={() => onFilter(filter?.kind === "none" ? null : { kind: "none" })} className={chip(filter?.kind === "none")}>
            Non rattachés · {unattachedCount}
          </button>
        </div>
        {zones.length === 0 ? <p className="mt-2 text-xs text-animeo-muted">Aucune zone définie.</p> : null}
        {zones.some((zone) => !zone.sector) ? (
          <p className="mt-2 text-xs text-animeo-muted">
            {zones.every((zone) => !zone.sector) ? "Vos zones" : "Certaines zones"} sont décrites par leurs communes : leurs clients sont reconnus, mais elles n’ont pas de contour sur la carte.
          </p>
        ) : null}
      </section>

      <Link href="/dashboard/tournees" className="inline-flex min-h-9 items-center text-xs font-extrabold text-animeo underline underline-offset-4 transition hover:text-animeo-hover">
        Organiser dans Tournées
      </Link>
    </div>
  );
}
