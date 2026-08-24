"use client";

import { useAppointments } from "@/components/appointments/appointments-context";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";

type AgendaSidePanelProps = {
  weekDates: Date[];
};

const weekDayLabels = ["L", "M", "M", "J", "V", "S", "D"];

function sameDay(first: Date, second: Date) {
  return first.getFullYear() === second.getFullYear()
    && first.getMonth() === second.getMonth()
    && first.getDate() === second.getDate();
}

function getCalendarDays(visibleDate: Date) {
  const year = visibleDate.getFullYear();
  const month = visibleDate.getMonth();
  const firstDay = new Date(year, month, 1, 12);
  const mondayOffset = (firstDay.getDay() + 6) % 7;
  const calendarStart = new Date(year, month, 1 - mondayOffset, 12);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(calendarStart);
    date.setDate(calendarStart.getDate() + index);
    return date;
  });
}

export function AgendaSidePanel({ weekDates }: AgendaSidePanelProps) {
  return (
    <aside className="grid gap-6 sm:grid-cols-2 xl:sticky xl:top-6 xl:grid-cols-1" aria-label="Informations complémentaires de l’agenda">
      <MiniCalendar weekDates={weekDates} />
      <NextAppointment />
      <TodayTour />
    </aside>
  );
}

function MiniCalendar({ weekDates }: AgendaSidePanelProps) {
  const visibleDate = weekDates[3];
  const days = getCalendarDays(visibleDate);
  const title = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(visibleDate);

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.13em] text-animeo">Calendrier</p>
          <h2 className="mt-1 font-extrabold capitalize text-animeo-dark">{title}</h2>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-animeo-soft text-animeo-dark">
          <Icon name="calendar" className="h-5 w-5" />
        </div>
      </div>

      <div className="grid grid-cols-7 gap-y-1 text-center">
        {weekDayLabels.map((label, index) => (
          <span key={`${label}-${index}`} className="pb-1 text-[10px] font-black text-animeo-muted">{label}</span>
        ))}
        {days.map((date) => {
          const inVisibleMonth = date.getMonth() === visibleDate.getMonth();
          const inSelectedWeek = date >= weekDates[0] && date <= weekDates[6];
          const isToday = sameDay(date, new Date(2026, 7, 24, 12));

          return (
            <span
              key={date.toISOString()}
              className={`mx-auto flex h-8 w-8 items-center justify-center rounded-xl text-xs font-extrabold ${
                isToday
                  ? "bg-animeo text-white"
                  : inSelectedWeek
                    ? "bg-animeo-soft text-animeo-dark"
                    : inVisibleMonth
                      ? "text-animeo-dark"
                      : "text-[#bcc5c7]"
              }`}
            >
              {date.getDate()}
            </span>
          );
        })}
      </div>
    </Card>
  );
}

function NextAppointment() {
  const { appointments, openManager } = useAppointments();
  const appointment = appointments
    .filter((item) => item.status === "confirmed" || item.status === "pending")
    .sort((first, second) => `${first.date} ${first.start}`.localeCompare(`${second.date} ${second.start}`))[0];

  if (!appointment) {
    return <Card className="p-5"><p className="text-xs font-extrabold uppercase tracking-[0.13em] text-animeo">Prochain rendez-vous</p><p className="mt-4 text-sm font-bold text-animeo-muted">Aucun rendez-vous à venir.</p></Card>;
  }

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.13em] text-animeo">Prochain rendez-vous</p>
          <p className="mt-2 text-2xl font-black text-animeo-dark">{appointment.start}</p>
        </div>
        <span className="rounded-full bg-[#E5F4F0] px-3 py-1 text-[10px] font-black text-animeo-dark">{appointment.mode === "cabinet" ? "Cabinet" : "Domicile"}</span>
      </div>
      <div className="mt-4 flex items-center gap-3 rounded-2xl bg-animeo-bg p-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-animeo-soft text-animeo-dark">
          <Icon name="paw" className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="font-extrabold text-animeo-dark">{appointment.animalName}</p>
          <p className="truncate text-xs text-animeo-muted">{appointment.clientName} · {appointment.serviceName}</p>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-xs font-bold text-animeo-muted">Durée {appointment.duration} min</p>
        <button type="button" onClick={() => openManager(appointment.id)} className="text-xs font-extrabold text-animeo">Modifier</button>
      </div>
    </Card>
  );
}

function TodayTour() {
  return (
    <Card className="p-5 sm:col-span-2 xl:col-span-1">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.13em] text-[#8067B0]">Tournée du jour</p>
          <h2 className="mt-2 text-lg font-extrabold text-animeo-dark">Secteur Rouen Ouest</h2>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#EEEAF8] text-[#8067B0]">
          <Icon name="tournees" className="h-5 w-5" />
        </div>
      </div>
      <p className="mt-1 text-sm text-animeo-muted">13:00 à 15:30 · 4 rendez-vous</p>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#EEEAF8]">
        <div className="h-full w-1/4 rounded-full bg-[#8067B0]" />
      </div>
      <div className="mt-2 flex justify-between text-xs font-bold text-animeo-muted">
        <span>1 terminé</span>
        <span>3 à venir</span>
      </div>
    </Card>
  );
}
