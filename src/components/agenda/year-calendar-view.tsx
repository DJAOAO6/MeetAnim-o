"use client";

import { getMonthGridDays } from "@/components/agenda/month-calendar-view";
import { getDayAgenda, getTopSpecies, getTopZones, getYearStats } from "@/lib/agenda-aggregation";
import { Card } from "@/components/ui/card";
import { Icon, type IconName } from "@/components/ui/icon";
import type { Appointment } from "@/data/appointments";
import type { AvailabilitySettings } from "@/data/settings";
import type { Tour } from "@/data/tours";

const weekDayLetters = ["L", "M", "M", "J", "V", "S", "D"];
const monthFormatter = new Intl.DateTimeFormat("fr-FR", { month: "long" });

function sameDay(first: Date, second: Date) {
  return first.getFullYear() === second.getFullYear() && first.getMonth() === second.getMonth() && first.getDate() === second.getDate();
}

function densityClass(count: number, isClosed: boolean) {
  if (isClosed) return "bg-[#eef1f0] text-[#b7c0c2]";
  if (count === 0) return "bg-[#f3f5f5] text-animeo-muted";
  if (count <= 2) return "bg-[#d9f0eb] text-animeo-dark";
  if (count <= 5) return "bg-[#8fd0c1] text-white";
  return "bg-[#2f9484] text-white";
}

type YearCalendarViewProps = {
  year: number;
  appointments: Appointment[];
  tours: Tour[];
  availability: AvailabilitySettings;
  onSelectMonth: (monthIndex: number) => void;
};

export function YearCalendarView({ year, appointments, tours, availability, onSelectMonth }: YearCalendarViewProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 12 }, (_, monthIndex) => (
        <YearMiniMonth key={monthIndex} year={year} monthIndex={monthIndex} appointments={appointments} tours={tours} availability={availability} onSelectMonth={onSelectMonth} />
      ))}
    </div>
  );
}

type YearMiniMonthProps = {
  year: number;
  monthIndex: number;
  appointments: Appointment[];
  tours: Tour[];
  availability: AvailabilitySettings;
  onSelectMonth: (monthIndex: number) => void;
};

function YearMiniMonth({ year, monthIndex, appointments, tours, availability, onSelectMonth }: YearMiniMonthProps) {
  const monthDate = new Date(year, monthIndex, 1, 12);
  const days = getMonthGridDays(monthDate);
  const isCurrentMonth = new Date().getFullYear() === year && new Date().getMonth() === monthIndex;
  const monthName = monthFormatter.format(monthDate);

  return (
    <button
      type="button"
      onClick={() => onSelectMonth(monthIndex)}
      aria-label={`Voir ${monthName} ${year} en vue Mois`}
      className="rounded-2xl border border-[#e5eae9] bg-white p-3 text-left transition hover:border-animeo hover:shadow-[0_4px_16px_rgba(24,59,69,0.06)]"
    >
      <p className={`mb-2 text-sm font-extrabold capitalize ${isCurrentMonth ? "text-animeo" : "text-animeo-dark"}`}>{monthName}</p>
      <div className="grid grid-cols-7 gap-[3px]">
        {weekDayLetters.map((label, index) => (
          <span key={`${label}-${index}`} className="text-center text-[8px] font-black text-animeo-muted">{label}</span>
        ))}
        {days.map((date) => {
          const inMonth = date.getMonth() === monthIndex;
          if (!inMonth) return <span key={date.toISOString()} className="h-4 w-4" />;

          const agenda = getDayAgenda(date, appointments, tours, availability);
          const hasTournee = agenda.items.some((item) => item.kind === "tournee");
          const isToday = sameDay(date, new Date());

          return (
            <span
              key={date.toISOString()}
              className={`relative flex h-4 w-4 items-center justify-center rounded-[3px] text-[8px] font-bold ${densityClass(agenda.count, agenda.isClosed)} ${isToday ? "ring-1 ring-animeo-dark" : ""}`}
            >
              {date.getDate()}
              {hasTournee ? <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full border border-white bg-[#8067B0]" /> : null}
            </span>
          );
        })}
      </div>
    </button>
  );
}

type YearStatsRibbonProps = {
  year: number;
  appointments: Appointment[];
  tours: Tour[];
};

export function YearStatsRibbon({ year, appointments, tours }: YearStatsRibbonProps) {
  const stats = getYearStats(year, appointments, tours);
  const items: Array<{ icon: IconName; value: string; label: string }> = [
    { icon: "document", value: String(stats.consultations), label: "consultations" },
    { icon: "euro", value: stats.revenueLabel, label: "chiffre d’affaires" },
    { icon: "tournees", value: String(stats.tours), label: "tournées" },
    { icon: "map", value: `${stats.distanceKm} km`, label: "parcourus" },
  ];

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl border border-[#e5eae9] bg-[#fbfdfc] px-4 py-3">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-2">
          <Icon name={item.icon} className="h-4 w-4 text-animeo" />
          <span className="text-sm font-black text-animeo-dark">{item.value}</span>
          <span className="text-xs font-bold text-animeo-muted">{item.label}</span>
        </div>
      ))}
      <div className="flex items-center gap-2 rounded-xl bg-animeo-soft px-3 py-1.5">
        <span className="text-xs font-bold text-animeo-dark">Mois le plus chargé :</span>
        <span className="text-xs font-black text-animeo">{stats.busiestMonth}</span>
      </div>
    </div>
  );
}

type YearSidePanelProps = {
  year: number;
  appointments: Appointment[];
  tours: Tour[];
};

export function YearSidePanel({ year, appointments, tours }: YearSidePanelProps) {
  const stats = getYearStats(year, appointments, tours);
  const topZones = getTopZones(year, appointments);
  const topSpecies = getTopSpecies(year, appointments);

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-4">
        <p className="text-xs font-extrabold uppercase tracking-[0.13em] text-animeo">Résumé annuel</p>
        <dl className="mt-3 flex flex-col gap-2 text-sm">
          <SummaryRow icon="document" label="Consultations" value={String(stats.consultations)} />
          <SummaryRow icon="euro" label="Chiffre d’affaires" value={stats.revenueLabel} />
          <SummaryRow icon="tournees" label="Tournées" value={String(stats.tours)} />
          <SummaryRow icon="map" label="Distance parcourue" value={`${stats.distanceKm} km`} />
          <SummaryRow icon="calendar" label="Durée moyenne / RDV" value={`${stats.avgDurationMinutes} min`} />
          <SummaryRow icon="stats" label="Mois le plus chargé" value={stats.busiestMonth} />
        </dl>
      </Card>

      <Card className="p-4">
        <p className="text-xs font-extrabold uppercase tracking-[0.13em] text-animeo">Top zones</p>
        {topZones.length > 0 ? (
          <ul className="mt-3 flex flex-col gap-2.5">
            {topZones.map((zone) => (
              <li key={zone.name} className="flex items-center justify-between gap-2">
                <span className="text-sm font-extrabold text-animeo-dark">{zone.name}</span>
                <span className="text-xs font-bold text-animeo-muted">{zone.count} consultation{zone.count > 1 ? "s" : ""}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-xs font-bold text-animeo-muted">Aucun rendez-vous à domicile cette année.</p>
        )}
      </Card>

      <Card className="p-4">
        <p className="text-xs font-extrabold uppercase tracking-[0.13em] text-animeo">Top espèces</p>
        {topSpecies.length > 0 ? (
          <ul className="mt-3 flex flex-col gap-2.5">
            {topSpecies.map((species) => (
              <li key={species.name} className="flex items-center justify-between gap-2">
                <span className="text-sm font-extrabold text-animeo-dark">{species.name}</span>
                <span className="text-xs font-bold text-animeo-muted">{species.count}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-xs font-bold text-animeo-muted">Aucun rendez-vous cette année.</p>
        )}
      </Card>
    </div>
  );
}

function SummaryRow({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-2 text-animeo-muted"><Icon name={icon} className="h-3.5 w-3.5" />{label}</span>
      <span className="font-extrabold text-animeo-dark">{value}</span>
    </div>
  );
}
