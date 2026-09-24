"use client";

export type AgendaViewMode = "day" | "week" | "month" | "year";

const options: Array<{ id: AgendaViewMode; label: string }> = [
  { id: "day", label: "Jour" },
  { id: "week", label: "Semaine" },
  { id: "month", label: "Mois" },
  { id: "year", label: "Année" },
];

type AgendaViewSwitcherProps = {
  value: AgendaViewMode;
  onChange: (view: AgendaViewMode) => void;
};

export function AgendaViewSwitcher({ value, onChange }: AgendaViewSwitcherProps) {
  return (
    // Sur téléphone, quatre boutons de 44 px de haut sur toute la largeur,
    // répartie selon les libellés.
    <div className="flex w-full rounded-xl bg-animeo-soft p-1 sm:inline-flex sm:w-fit" aria-label="Choix de la vue">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={value === option.id}
          onClick={() => onChange(option.id)}
          className={`min-h-11 flex-auto whitespace-nowrap rounded-lg px-1 text-[13px] sm:flex-none font-extrabold transition sm:min-h-0 sm:px-3.5 sm:py-2 sm:text-sm ${
            value === option.id ? "bg-white text-animeo-dark shadow-sm" : "text-animeo-muted hover:text-animeo-dark"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
