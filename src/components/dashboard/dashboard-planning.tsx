"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useAppointments } from "@/components/appointments/appointments-context";
import { useDashboardTheme } from "@/components/theme/dashboard-theme-provider";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { resolveSpeciesColor } from "@/data/species";
import { dateId, referenceDate } from "@/components/dashboard/dashboard-date";
import type { Appointment } from "@/data/appointments";

export function DashboardPlanning() {
  const { appointments, openManager } = useAppointments();
  const { theme } = useDashboardTheme();

  const todayAppointments = useMemo(() => {
    const todayId = dateId(referenceDate);
    return appointments
      .filter((appointment) => appointment.date === todayId && appointment.status !== "cancelled")
      .sort((first, second) => first.start.localeCompare(second.start));
  }, [appointments]);

  const dateLabel = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" }).format(referenceDate);

  return (
    <Card className="flex h-full flex-col p-5 sm:p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-animeo-soft text-animeo-dark"><Icon name="calendar" className="h-5 w-5" /></span>
          <div>
            <h2 className="font-black text-animeo-dark">Planning du jour</h2>
            <p className="mt-0.5 text-xs capitalize text-animeo-muted">{dateLabel}</p>
          </div>
        </div>
        <Link href="/dashboard/agenda" className="flex items-center gap-1 text-sm font-extrabold text-animeo transition hover:text-animeo-dark">
          Agenda complet
          <Icon name="arrow" className="h-4 w-4" />
        </Link>
      </div>

      {todayAppointments.length > 0 ? (
        <ol className="relative flex-1 space-y-0">
          {todayAppointments.map((appointment, index) => (
            <TimelineRow
              key={appointment.id}
              appointment={appointment}
              isLast={index === todayAppointments.length - 1}
              color={appointment.animalSpecies ? resolveSpeciesColor(theme.speciesColors, appointment.animalSpecies) : "#7c8b90"}
              onEdit={() => openManager(appointment.id)}
            />
          ))}
        </ol>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center rounded-2xl bg-animeo-bg px-4 py-10 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-animeo-dark shadow-sm"><Icon name="calendar" className="h-6 w-6" /></span>
          <p className="mt-4 font-bold text-animeo-dark">Aucun rendez-vous aujourd’hui</p>
          <p className="mt-1 text-sm text-animeo-muted">Votre journée est libre pour le moment.</p>
          <Link href="/dashboard/agenda" className="mt-5 rounded-2xl bg-white px-4 py-2.5 text-sm font-extrabold text-animeo-dark shadow-sm transition hover:bg-animeo-soft">
            Consulter l’agenda
          </Link>
        </div>
      )}
    </Card>
  );
}

function TimelineRow({ appointment, isLast, color, onEdit }: { appointment: Appointment; isLast: boolean; color: string; onEdit: () => void }) {
  const isHomeVisit = appointment.mode === "home";

  return (
    <li className="flex gap-4">
      <div className="flex w-16 shrink-0 flex-col items-center pt-1">
        <span className="text-sm font-black text-animeo-dark">{appointment.start}</span>
        <span className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
        {!isLast ? <span className="mt-1 w-px flex-1 bg-[#e5eeeb]" /> : null}
      </div>
      <div className={`flex min-w-0 flex-1 items-center gap-3 pb-6 ${isLast ? "" : ""}`}>
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-lg" style={{ backgroundColor: `color-mix(in srgb, ${color} 18%, white)`, color }}>
          <Icon name="paw" className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-extrabold text-animeo-dark">{appointment.animalName}</p>
            {appointment.animalSpecies ? <span className="text-xs font-bold text-animeo-muted">· {appointment.animalSpecies}</span> : null}
          </div>
          <p className="truncate text-sm text-animeo-muted">{appointment.clientName}</p>
        </div>
        <span className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-extrabold ${isHomeVisit ? "bg-[#fff4dd] text-[#946116]" : "bg-animeo-soft text-animeo-dark"}`}>
          {isHomeVisit ? "Domicile" : "Cabinet"}
        </span>
        <button type="button" onClick={onEdit} aria-label={`Actions pour le rendez-vous de ${appointment.animalName}`} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-animeo-muted transition hover:bg-animeo-bg hover:text-animeo-dark">
          <DotsIcon />
        </button>
      </div>
    </li>
  );
}

function DotsIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
      <circle cx="5" cy="12" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="19" cy="12" r="2" />
    </svg>
  );
}
