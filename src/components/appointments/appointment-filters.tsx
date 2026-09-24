"use client";

import { Search, X } from "lucide-react";
import { appointmentStatusLabels, type AppointmentStatus } from "@/data/appointments";

export type DateFilter = "all" | "today" | "tomorrow" | "week" | "month" | "past";
export type StatusFilter = "all" | AppointmentStatus;
export type PlaceFilter = "all" | "cabinet" | "home";

export type AppointmentFilterState = {
  search: string;
  date: DateFilter;
  status: StatusFilter;
  place: PlaceFilter;
};

export const defaultFilters: AppointmentFilterState = { search: "", date: "week", status: "all", place: "all" };

export const dateFilterLabels: Record<DateFilter, string> = {
  all: "Toutes les dates",
  today: "Aujourd’hui",
  tomorrow: "Demain",
  week: "Cette semaine",
  month: "Ce mois-ci",
  past: "Passés",
};

const placeFilterLabels: Record<PlaceFilter, string> = {
  all: "Tous les lieux",
  cabinet: "Cabinet",
  home: "Domicile",
};

const selectClassName = "h-10 rounded-xl border border-animeo-border bg-animeo-bg px-3 text-sm font-extrabold text-animeo-dark outline-none transition focus:border-animeo";

/**
 * Filtres du centre de gestion.
 *
 * Trois listes déroulantes natives plutôt que des menus maison : elles sont
 * utilisables au clavier et au doigt sans rien réécrire, et sur téléphone le
 * système affiche son propre sélecteur, bien plus confortable qu'un menu
 * reproduit en HTML.
 *
 * Le filtre « Lieu » ne propose que Cabinet et Domicile : ce sont les deux
 * seuls modes qu'un rendez-vous peut avoir en base. Une tournée est une
 * journée à part, pas un mode de rendez-vous.
 */
export function AppointmentFilters({ value, resultCount, onChange, onReset }: {
  value: AppointmentFilterState;
  resultCount: number;
  onChange: (change: Partial<AppointmentFilterState>) => void;
  onReset: () => void;
}) {
  const filtered = value.search.trim() !== "" || value.date !== defaultFilters.date || value.status !== "all" || value.place !== "all";

  return (
    // Écran large : recherche et filtres sur une seule ligne — chaque ligne
    // gagnée revient à la liste et à la fiche.
    <div className="grid gap-3 xl:flex xl:items-center">
      <div className="relative xl:min-w-0 xl:flex-1">
        <Search aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-animeo-muted" />
        <input
          type="search"
          value={value.search}
          onChange={(event) => onChange({ search: event.target.value })}
          aria-label="Rechercher un client, un animal ou une prestation"
          placeholder="Rechercher un client, un animal ou une prestation…"
          className="h-11 w-full rounded-xl border border-animeo-border bg-animeo-bg pl-10 pr-10 text-sm font-semibold text-animeo-dark outline-none transition placeholder:text-animeo-subtle focus:border-animeo focus:bg-white"
        />
        {value.search ? (
          <button
            type="button"
            onClick={() => onChange({ search: "" })}
            aria-label="Effacer la recherche"
            className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-animeo-muted transition hover:bg-white"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2 xl:flex-nowrap">
        <select value={value.date} onChange={(event) => onChange({ date: event.target.value as DateFilter })} aria-label="Filtrer par date" className={selectClassName}>
          {Object.entries(dateFilterLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>

        <select value={value.status} onChange={(event) => onChange({ status: event.target.value as StatusFilter })} aria-label="Filtrer par statut" className={selectClassName}>
          <option value="all">Tous les statuts</option>
          {Object.entries(appointmentStatusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>

        <select value={value.place} onChange={(event) => onChange({ place: event.target.value as PlaceFilter })} aria-label="Filtrer par lieu" className={selectClassName}>
          {Object.entries(placeFilterLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>

        <p aria-live="polite" className="ml-auto text-xs font-bold text-animeo-muted">
          {resultCount} rendez-vous
        </p>

        {filtered ? (
          <button type="button" onClick={onReset} className="min-h-9 rounded-xl px-3 text-xs font-extrabold text-animeo transition hover:bg-animeo-bg">
            Réinitialiser les filtres
          </button>
        ) : null}
      </div>
    </div>
  );
}
