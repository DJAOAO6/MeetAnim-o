"use client";

import { CircleHelp } from "lucide-react";
import { useId, useState } from "react";
import { filterOptions, kindDotColor, type MonthFilter } from "@/components/agenda/month-calendar-view";

type AgendaFilterBarProps = {
  value: MonthFilter;
  onChange: (value: MonthFilter) => void;
  /** Lignes d'aide, derrière l'icône « ? » (vide : pas d'icône). */
  help?: string[];
};

/**
 * Légende de l'agenda, qui sert aussi de filtre : un clic sur un type n'affiche
 * que lui, un second clic revient à tout afficher. « Fermé » n'est qu'une
 * légende — les zones fermées se règlent dans « Affichage ».
 */
export function AgendaFilterBar({ value, onChange, help = [] }: AgendaFilterBarProps) {
  const tooltipId = useId();
  // Échap referme l'aide sans avoir à déplacer la souris (WCAG 1.4.13).
  const [helpDismissed, setHelpDismissed] = useState(false);
  const chips = filterOptions.filter((option): option is { id: Exclude<MonthFilter, "all">; label: string } => option.id !== "all");

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div role="group" aria-label="Légende et filtre des rendez-vous" className="flex flex-wrap items-center gap-2">
        {chips.map((option) => {
          const active = value === option.id;
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={active}
              title={active ? "Afficher tous les types" : `N’afficher que : ${option.label}`}
              onClick={() => onChange(active ? "all" : option.id)}
              className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-3 text-xs font-extrabold transition sm:min-h-9 ${
                active ? "border-animeo bg-animeo text-white" : "border-transparent bg-animeo-bg text-animeo-dark hover:border-animeo-border"
              }`}
            >
              <span aria-hidden="true" className={`h-2 w-2 rounded-full ${active ? "bg-white" : kindDotColor[option.id]}`} />
              {option.label}
            </button>
          );
        })}
        <span className="inline-flex min-h-11 items-center gap-2 rounded-full bg-animeo-bg px-3 text-xs font-extrabold text-animeo-muted sm:min-h-9">
          <span aria-hidden="true" className="h-2 w-2 rounded-full bg-animeo-subtle" />
          Fermé
        </span>
      </div>

      {help.length ? (
        <span
          className="group relative inline-flex"
          onKeyDown={(event) => { if (event.key === "Escape") setHelpDismissed(true); }}
          onPointerLeave={() => setHelpDismissed(false)}
          onBlur={() => setHelpDismissed(false)}
        >
          <button
            type="button"
            aria-label="Aide sur l’agenda"
            aria-describedby={tooltipId}
            className="flex h-11 w-11 items-center justify-center rounded-full sm:h-9 sm:w-9 text-animeo-muted transition hover:bg-animeo-bg hover:text-animeo-dark focus-visible:outline-2 focus-visible:outline-animeo"
          >
            <CircleHelp aria-hidden="true" className="h-[18px] w-[18px]" />
          </button>
          <span
            id={tooltipId}
            role="tooltip"
            className={`pointer-events-none invisible absolute left-0 top-[calc(100%+0.375rem)] z-50 w-72 rounded-xl bg-animeo-dark px-3 py-2.5 text-xs font-semibold leading-5 text-white opacity-0 shadow-lg transition-opacity duration-150 group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100 sm:left-1/2 sm:-translate-x-1/2 ${helpDismissed ? "!invisible !opacity-0" : ""}`}
          >
            {help.map((line) => <span key={line} className="block">{line}</span>)}
          </span>
        </span>
      ) : null}
    </div>
  );
}
