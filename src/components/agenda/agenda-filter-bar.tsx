"use client";

import { filterOptions, kindDotColor, type MonthFilter } from "@/components/agenda/month-calendar-view";

type AgendaFilterBarProps = {
  value: MonthFilter;
  onChange: (value: MonthFilter) => void;
};

export function AgendaFilterBar({ value, onChange }: AgendaFilterBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="Filtrer les rendez-vous affichés">
      {filterOptions.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={value === option.id}
          onClick={() => onChange(option.id)}
          className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-extrabold transition ${
            value === option.id ? "bg-animeo text-white" : "bg-animeo-bg text-animeo-muted hover:bg-animeo-soft hover:text-animeo-dark"
          }`}
        >
          {option.id !== "all" ? <span className={`h-1.5 w-1.5 rounded-full ${value === option.id ? "bg-white" : kindDotColor[option.id]}`} /> : null}
          {option.label}
        </button>
      ))}
    </div>
  );
}
