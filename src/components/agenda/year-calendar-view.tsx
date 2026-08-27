"use client";

import { getMonthGridDays } from "@/components/agenda/month-calendar-view";
import { getMockDayAgenda, TOP_SPECIES, TOP_ZONES, YEAR_STATS } from "@/data/agenda-mock";
import { Card } from "@/components/ui/card";
import { Icon, type IconName } from "@/components/ui/icon";
import type { AvailabilitySettings } from "@/data/settings";

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
  availability: AvailabilitySettings;
  onSelectMonth: (monthIndex: number) => void;
};

export function YearCalendarView({ year, availability, onSelectMonth }: YearCalendarViewProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 12 }, (_, monthIndex) => (
        <YearMiniMonth key={monthIndex} year={year} monthIndex={monthIndex} availability={availability} onSelectMonth={onSelectMonth} />
      ))}
    </div>
  );
}

type YearMiniMonthProps = {
  year: number;
  monthIndex: number;
  availability: AvailabilitySettings;
  onSelectMonth: (monthIndex: number) => void;
};

function YearMiniMonth({ year, monthIndex, availability, onSelectMonth }: YearMiniMonthProps) {
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

          const agenda = getMockDayAgenda(date, availability);
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

export function YearStatsRibbon() {
  const items: Array<{ icon: IconName; value: string; label: string }> = [
    { icon: "document", value: String(YEAR_STATS.consultations), label: "consultations" },
    { icon: "euro", value: YEAR_STATS.revenueLabel, label: "chiffre d’affaires" },
    { icon: "tournees", value: String(YEAR_STATS.tours), label: "tournées" },
    { icon: "map", value: `${YEAR_STATS.distanceKm} km`, label: "parcourus" },
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
        <span className="text-xs font-black text-animeo">{YEAR_STATS.busiestMonth}</span>
      </div>
    </div>
  );
}

export function YearSidePanel() {
  return (
    <div className="flex flex-col gap-4">
      <Card className="p-4">
        <p className="text-xs font-extrabold uppercase tracking-[0.13em] text-animeo">Résumé annuel</p>
        <dl className="mt-3 flex flex-col gap-2 text-sm">
          <SummaryRow icon="document" label="Consultations" value={String(YEAR_STATS.consultations)} />
          <SummaryRow icon="euro" label="Chiffre d’affaires" value={YEAR_STATS.revenueLabel} />
          <SummaryRow icon="tournees" label="Tournées" value={String(YEAR_STATS.tours)} />
          <SummaryRow icon="map" label="Distance parcourue" value={`${YEAR_STATS.distanceKm} km`} />
          <SummaryRow icon="calendar" label="Durée moyenne / RDV" value={`${YEAR_STATS.avgDurationMinutes} min`} />
          <SummaryRow icon="stats" label="Mois le plus chargé" value={YEAR_STATS.busiestMonth} />
        </dl>
      </Card>

      <Card className="p-4">
        <p className="text-xs font-extrabold uppercase tracking-[0.13em] text-animeo">Top zones</p>
        <ul className="mt-3 flex flex-col gap-2.5">
          {TOP_ZONES.map((zone) => (
            <li key={zone.name} className="flex items-center justify-between gap-2">
              <span className="text-sm font-extrabold text-animeo-dark">{zone.name}</span>
              <span className="text-xs font-bold text-animeo-muted">{zone.count} consultations</span>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="p-4">
        <p className="text-xs font-extrabold uppercase tracking-[0.13em] text-animeo">Top espèces</p>
        <ul className="mt-3 flex flex-col gap-2.5">
          {TOP_SPECIES.map((species) => (
            <li key={species.name} className="flex items-center justify-between gap-2">
              <span className="text-sm font-extrabold text-animeo-dark">{species.name}</span>
              <span className="text-xs font-bold text-animeo-muted">{species.count}</span>
            </li>
          ))}
        </ul>
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
