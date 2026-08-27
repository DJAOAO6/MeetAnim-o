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
    <div className="inline-flex w-fit rounded-xl bg-animeo-soft p-1" aria-label="Choix de la vue">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={value === option.id}
          onClick={() => onChange(option.id)}
          className={`rounded-lg px-3.5 py-2 text-sm font-extrabold transition ${
            value === option.id ? "bg-white text-animeo-dark shadow-sm" : "text-animeo-muted hover:text-animeo-dark"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
