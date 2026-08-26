"use client";

import Link from "next/link";
import { useAppointments } from "@/components/appointments/appointments-context";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import type { Appointment } from "@/data/appointments";

const referenceDate = new Date(2026, 7, 24, 12);
const dayInMs = 24 * 60 * 60 * 1000;

function dateId(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function AppointmentStatCards() {
  const { appointments, openManager } = useAppointments();
  const todayCount = appointments.filter((appointment) => appointment.date === "2026-08-24" && appointment.status !== "cancelled").length;
  const pendingCount = appointments.filter((appointment) => appointment.status === "pending").length;

  return (
    <>
      <button type="button" onClick={() => openManager()} className="text-left">
        <Card className="h-full p-5 transition hover:border-animeo">
          <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-2xl bg-animeo-soft text-animeo-dark"><Icon name="calendar" className="h-5 w-5" /></div>
          <p className="text-sm font-bold leading-snug text-animeo-muted">Rendez-vous aujourd’hui</p>
          <p className="mt-2 text-3xl font-black text-animeo">{todayCount}</p>
          <p className="mt-2 text-xs text-animeo-muted">Cliquez pour gérer les rendez-vous</p>
        </Card>
      </button>
      <button type="button" onClick={() => openManager()} className="text-left">
        <Card className="h-full p-5 transition hover:border-animeo-accent">
          <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-2xl bg-[#fff4dd] text-[#b7791f]"><Icon name="agenda" className="h-5 w-5" /></div>
          <p className="text-sm font-bold leading-snug text-animeo-muted">Demandes en attente</p>
          <p className="mt-2 text-3xl font-black text-animeo-accent">{pendingCount}</p>
          <p className="mt-2 text-xs text-animeo-muted">À accepter ou refuser</p>
        </Card>
      </button>
    </>
  );
}

export function DashboardAgendaOverview() {
  const { appointments, openManager } = useAppointments();
  const weekDates = Array.from({ length: 7 }, (_, index) => new Date(referenceDate.getTime() + index * dayInMs));
  const visibleAppointments = appointments.filter((appointment) => appointment.status !== "cancelled");
  const todayAppointments = visibleAppointments
    .filter((appointment) => appointment.date === dateId(referenceDate))
    .sort((first, second) => first.start.localeCompare(second.start));

  return (
    <Card className="mb-6 overflow-hidden p-5 sm:p-7">
      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-animeo">Semaine du 24 au 30 août</p>
          <h2 className="mt-1 text-xl font-extrabold text-animeo-dark sm:text-2xl">Agenda</h2>
        </div>
        <Link href="/dashboard/agenda" className="flex items-center gap-1 text-sm font-extrabold text-animeo transition hover:text-animeo-dark">
          Ouvrir l’agenda complet
          <Icon name="arrow" className="h-4 w-4" />
        </Link>
      </div>

      <div className="mb-6 grid grid-cols-4 gap-2 sm:grid-cols-7" aria-label="Jours de la semaine">
        {weekDates.map((date, index) => {
          const count = visibleAppointments.filter((appointment) => appointment.date === dateId(date)).length;
          const active = index === 0;
          return (
            <div key={date.toISOString()} className={`rounded-2xl border px-2 py-3 text-center ${active ? "border-animeo bg-animeo-soft" : "border-[#e1eae8] bg-animeo-bg"}`}>
              <p className="text-[10px] font-black uppercase tracking-[0.1em] text-animeo-muted">{new Intl.DateTimeFormat("fr-FR", { weekday: "short" }).format(date).replace(".", "")}</p>
              <p className={`mt-1 text-lg font-black ${active ? "text-animeo" : "text-animeo-dark"}`}>{date.getDate()}</p>
              <p className="mt-1 text-[10px] font-bold text-animeo-muted">{count} RDV</p>
            </div>
          );
        })}
      </div>

      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="font-black text-animeo-dark">Lundi 24 août · {todayAppointments.length} rendez-vous</h3>
        <span className="rounded-full bg-animeo-soft px-3 py-1 text-xs font-extrabold text-animeo-dark">Aujourd’hui</span>
      </div>
      <div className="divide-y divide-[#edf2f0]">
        {todayAppointments.map((appointment) => <DashboardAppointment key={appointment.id} appointment={appointment} onEdit={() => openManager(appointment.id)} />)}
        {todayAppointments.length === 0 ? <p className="py-8 text-center text-sm font-bold text-animeo-muted">Aucun rendez-vous prévu aujourd’hui.</p> : null}
      </div>
    </Card>
  );
}

function DashboardAppointment({ appointment, onEdit }: { appointment: Appointment; onEdit: () => void }) {
  const isHomeVisit = appointment.mode === "home";
  return (
    <button type="button" onClick={onEdit} className="grid w-full grid-cols-[55px_42px_minmax(0,1fr)] items-center gap-3 py-4 text-left transition hover:bg-animeo-bg sm:grid-cols-[65px_42px_minmax(0,1fr)_auto_auto]">
      <p className="font-extrabold text-animeo">{appointment.start}</p>
      <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-animeo-soft text-animeo-dark"><Icon name="paw" className="h-5 w-5" /></span>
      <span className="min-w-0"><span className="block truncate font-extrabold text-animeo-dark">{appointment.animalName}</span><span className="block truncate text-sm text-animeo-muted">{appointment.clientName}</span></span>
      <span className={`col-start-3 w-fit rounded-full px-3 py-1.5 text-xs font-extrabold sm:col-start-auto ${isHomeVisit ? "bg-[#fff4dd] text-[#946116]" : "bg-animeo-soft text-animeo-dark"}`}>{isHomeVisit ? `Domicile · ${appointment.location}` : "Cabinet"}</span>
      <span className="col-start-3 text-xs font-extrabold text-animeo sm:col-start-auto">Modifier</span>
    </button>
  );
}
