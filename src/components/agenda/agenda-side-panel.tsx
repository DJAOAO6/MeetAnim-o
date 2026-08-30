"use client";

import { useMemo, useState } from "react";
import { useAppointments } from "@/components/appointments/appointments-context";
import { dateId, referenceDate } from "@/components/dashboard/dashboard-date";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { tourRunsOnDate, weekdayLabelFor } from "@/lib/tour-schedule";
import type { Tour, TourAppointment } from "@/data/tours";

type AgendaSidePanelProps = {
  weekDates: Date[];
  tours: Tour[];
  tourAppointments: Record<string, TourAppointment[]>;
  onSelectDate: (date: Date) => void;
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

export function AgendaSidePanel({ weekDates, tours, tourAppointments, onSelectDate }: AgendaSidePanelProps) {
  return (
    <aside className="grid gap-6 sm:grid-cols-2 xl:sticky xl:top-6 xl:grid-cols-1" aria-label="Informations complémentaires de l’agenda">
      <MiniCalendar weekDates={weekDates} onSelectDate={onSelectDate} />
      <NextAppointment />
      <TodayTour tours={tours} tourAppointments={tourAppointments} />
    </aside>
  );
}

function MiniCalendar({ weekDates, onSelectDate }: { weekDates: Date[]; onSelectDate: (date: Date) => void }) {
  const referenceWeekDate = weekDates[3];
  const referenceYear = referenceWeekDate.getFullYear();
  const referenceMonth = referenceWeekDate.getMonth();
  const [monthOffset, setMonthOffset] = useState(0);
  // Synchronisation dans les deux sens : quand le planning principal change
  // de semaine (navigation, "Aujourd'hui"), le mini calendrier doit suivre
  // sans qu'il faille cliquer dessus — on annule alors tout parcours
  // indépendant du mois fait via ses propres flèches. Ajustement pendant le
  // rendu plutôt que dans un effet (évite un rendu supplémentaire) : voir
  // « Adjusting state when a prop changes » dans la doc React.
  const [prevReference, setPrevReference] = useState({ referenceYear, referenceMonth });
  if (prevReference.referenceYear !== referenceYear || prevReference.referenceMonth !== referenceMonth) {
    setPrevReference({ referenceYear, referenceMonth });
    setMonthOffset(0);
  }

  const visibleDate = useMemo(
    () => new Date(referenceYear, referenceMonth + monthOffset, 1, 12),
    [referenceYear, referenceMonth, monthOffset],
  );
  const days = getCalendarDays(visibleDate);
  const title = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(visibleDate);

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-extrabold uppercase tracking-[0.13em] text-animeo">Calendrier</p>
          <h2 className="mt-1 truncate font-extrabold capitalize text-animeo-dark">{title}</h2>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => setMonthOffset((current) => current - 1)}
            aria-label="Mois précédent"
            className="flex h-8 w-8 items-center justify-center rounded-xl text-animeo-dark transition hover:bg-animeo-bg"
          >
            <Icon name="arrow" className="h-4 w-4 rotate-180" />
          </button>
          <button
            type="button"
            onClick={() => setMonthOffset((current) => current + 1)}
            aria-label="Mois suivant"
            className="flex h-8 w-8 items-center justify-center rounded-xl text-animeo-dark transition hover:bg-animeo-bg"
          >
            <Icon name="arrow" className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-y-1 text-center">
        {weekDayLabels.map((label, index) => (
          <span key={`${label}-${index}`} className="pb-1 text-[10px] font-black text-animeo-muted">{label}</span>
        ))}
        {days.map((date) => {
          const inVisibleMonth = date.getMonth() === visibleDate.getMonth();
          const inSelectedWeek = date >= weekDates[0] && date <= weekDates[6];
          const isToday = sameDay(date, new Date());

          return (
            <button
              key={date.toISOString()}
              type="button"
              onClick={() => onSelectDate(date)}
              aria-label={new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(date)}
              className={`mx-auto flex h-8 w-8 items-center justify-center rounded-xl text-xs font-extrabold transition hover:bg-animeo hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-animeo-dark ${
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
            </button>
          );
        })}
      </div>
    </Card>
  );
}

function NextAppointment() {
  const { appointments, openManager } = useAppointments();
  const todayId = dateId(referenceDate());
  const appointment = appointments
    .filter((item) => (item.status === "confirmed" || item.status === "pending") && item.date >= todayId)
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

function timeToMinutes(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function TodayTour({ tours, tourAppointments }: { tours: Tour[]; tourAppointments: Record<string, TourAppointment[]> }) {
  const today = referenceDate();
  const todayId = dateId(today);
  const weekday = weekdayLabelFor(today);
  const todaysTours = tours
    .filter((tour) => tour.status === "Active" && tourRunsOnDate(tour, todayId, weekday))
    .sort((first, second) => first.startTime.localeCompare(second.startTime));

  if (todaysTours.length === 0) {
    return (
      <Card className="p-5 sm:col-span-2 xl:col-span-1">
        <p className="text-xs font-extrabold uppercase tracking-[0.13em] text-[#8067B0]">Tournée du jour</p>
        <p className="mt-3 text-sm font-bold text-animeo-muted">Aucune tournée prévue ce jour-là.</p>
      </Card>
    );
  }

  if (todaysTours.length > 1) {
    return (
      <Card className="p-5 sm:col-span-2 xl:col-span-1">
        <div className="flex items-center justify-between">
          <p className="text-xs font-extrabold uppercase tracking-[0.13em] text-[#8067B0]">Tournées du jour</p>
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#EEEAF8] text-[#8067B0]">
            <Icon name="tournees" className="h-5 w-5" />
          </div>
        </div>
        <ul className="mt-3 flex flex-col gap-2.5">
          {todaysTours.map((tour) => (
            <li key={tour.id} className="rounded-xl bg-animeo-bg px-3 py-2.5">
              <p className="font-extrabold text-animeo-dark">{tour.name}</p>
              <p className="text-xs font-bold text-animeo-muted">{tour.startTime} à {tour.endTime} · {tour.appointmentCount} rendez-vous</p>
            </li>
          ))}
        </ul>
      </Card>
    );
  }

  const tour = todaysTours[0];
  const stops = tourAppointments[tour.id] ?? [];
  const nowMinutes = today.getHours() * 60 + today.getMinutes();
  const doneCount = stops.filter((stop) => timeToMinutes(stop.time) <= nowMinutes).length;
  const total = stops.length || tour.appointmentCount;
  const progress = total > 0 ? Math.min(1, doneCount / total) : 0;

  return (
    <Card className="p-5 sm:col-span-2 xl:col-span-1">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.13em] text-[#8067B0]">Tournée du jour</p>
          <h2 className="mt-2 text-lg font-extrabold text-animeo-dark">{tour.name}</h2>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#EEEAF8] text-[#8067B0]">
          <Icon name="tournees" className="h-5 w-5" />
        </div>
      </div>
      <p className="mt-1 text-sm text-animeo-muted">{tour.startTime} à {tour.endTime} · {tour.appointmentCount} rendez-vous</p>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#EEEAF8]">
        <div className="h-full rounded-full bg-[#8067B0]" style={{ width: `${progress * 100}%` }} />
      </div>
      <div className="mt-2 flex justify-between text-xs font-bold text-animeo-muted">
        <span>{doneCount} terminé{doneCount > 1 ? "s" : ""}</span>
        <span>{Math.max(0, total - doneCount)} à venir</span>
      </div>
    </Card>
  );
}
