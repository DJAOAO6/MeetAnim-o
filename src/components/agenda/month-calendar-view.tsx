"use client";

import { getMockDayAgenda, type MockDayItem, type MockEventKind } from "@/data/agenda-mock";
import type { AvailabilitySettings } from "@/data/settings";

export type MonthFilter = "all" | MockEventKind;

export const filterOptions: Array<{ id: MonthFilter; label: string }> = [
  { id: "all", label: "Tous" },
  { id: "cabinet", label: "Cabinet" },
  { id: "domicile", label: "Domicile" },
  { id: "pending", label: "En attente" },
  { id: "tournee", label: "Tournées" },
];

export const kindDotColor: Record<MockEventKind, string> = {
  cabinet: "bg-[#4FAF9F]",
  domicile: "bg-[#4C8190]",
  pending: "bg-animeo-accent",
  tournee: "bg-[#8067B0]",
};

const compactEventStyles: Record<MockEventKind, string> = {
  cabinet: "border-[#4FAF9F] bg-[#4FAF9F]/[0.06] text-animeo-dark",
  domicile: "border-[#4C8190] bg-[#4C8190]/[0.06] text-[#234E5A]",
  pending: "border-animeo-accent bg-[#F4B860]/[0.12] text-[#7E5718]",
  tournee: "border-[#8067B0] bg-[#8067B0]/[0.06] text-[#55417F]",
};

const weekDayLabels = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

export function getMonthGridDays(monthDate: Date): Date[] {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstOfMonth = new Date(year, month, 1, 12);
  const mondayOffset = (firstOfMonth.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const totalCells = Math.ceil((mondayOffset + daysInMonth) / 7) * 7;
  const start = new Date(year, month, 1 - mondayOffset, 12);

  return Array.from({ length: totalCells }, (_, index) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + index, 12));
}

function sameDay(first: Date, second: Date) {
  return first.getFullYear() === second.getFullYear() && first.getMonth() === second.getMonth() && first.getDate() === second.getDate();
}

export function CompactAppointment({ item }: { item: MockDayItem }) {
  return (
    <div className={`truncate rounded-[4px] border-l-2 px-1.5 py-0.5 text-[10px] font-bold leading-tight ${compactEventStyles[item.kind]}`}>
      <span className="font-black">{item.start}</span> {item.title}
    </div>
  );
}

type MonthDayCellProps = {
  date: Date;
  monthDate: Date;
  availability: AvailabilitySettings;
  filter: MonthFilter;
  isSelected: boolean;
  onSelect: (date: Date) => void;
};

export function MonthDayCell({ date, monthDate, availability, filter, isSelected, onSelect }: MonthDayCellProps) {
  const inCurrentMonth = date.getMonth() === monthDate.getMonth();
  const isToday = sameDay(date, new Date());
  const agenda = getMockDayAgenda(date, availability);
  const items = filter === "all" ? agenda.items : agenda.items.filter((item) => item.kind === filter);
  const visibleItems = items.slice(0, 3);
  const hiddenCount = items.length - visibleItems.length;

  return (
    <button
      type="button"
      onClick={() => onSelect(date)}
      aria-label={`Voir le détail du ${date.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}`}
      className={`flex min-h-[92px] flex-col gap-1 border-b border-r border-[#e5eae9] p-1.5 text-left transition last:border-r-0 focus-visible:relative focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-animeo-dark ${
        isSelected ? "bg-animeo-soft" : agenda.isClosed ? "bg-[#fbfcfc] hover:bg-animeo-bg" : "bg-white hover:bg-animeo-bg"
      } ${!inCurrentMonth ? "opacity-45" : ""}`}
    >
      <div className="flex items-center justify-between gap-1">
        <span className={`flex h-6 w-6 items-center justify-center rounded-lg text-xs font-black ${isToday ? "bg-animeo text-white" : "text-animeo-dark"}`}>
          {date.getDate()}
        </span>
        {agenda.count > 0 ? <span className="text-[10px] font-extrabold text-animeo-muted">{agenda.count}</span> : null}
      </div>

      {agenda.isClosed ? (
        <span className="mt-1 text-[10px] font-bold uppercase tracking-[0.06em] text-[#9aa5a8]">Fermé</span>
      ) : (
        <div className="flex flex-col gap-0.5">
          {visibleItems.map((item) => <CompactAppointment key={item.id} item={item} />)}
          {hiddenCount > 0 ? <span className="px-1.5 text-[10px] font-extrabold text-animeo">+ {hiddenCount} autre{hiddenCount > 1 ? "s" : ""}</span> : null}
        </div>
      )}
    </button>
  );
}

type MonthCalendarViewProps = {
  monthDate: Date;
  availability: AvailabilitySettings;
  filter: MonthFilter;
  selectedDay: Date | null;
  onSelectDay: (date: Date) => void;
};

export function MonthCalendarView({ monthDate, availability, filter, selectedDay, onSelectDay }: MonthCalendarViewProps) {
  const days = getMonthGridDays(monthDate);

  return (
    <div className="overflow-hidden rounded-2xl border border-[#e5eae9]">
      <div className="grid grid-cols-7 border-b border-[#e5eae9] bg-[#fbfdfc]">
        {weekDayLabels.map((label) => (
          <span key={label} className="border-r border-[#e5eae9] px-2 py-2 text-center text-[11px] font-extrabold uppercase tracking-[0.1em] text-animeo-muted last:border-r-0">
            {label}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((date) => (
          <MonthDayCell
            key={date.toISOString()}
            date={date}
            monthDate={monthDate}
            availability={availability}
            filter={filter}
            isSelected={Boolean(selectedDay && sameDay(date, selectedDay))}
            onSelect={onSelectDay}
          />
        ))}
      </div>
    </div>
  );
}
