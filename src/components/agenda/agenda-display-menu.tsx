"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { ChevronDown, Settings2 } from "lucide-react";
import { Toggle } from "@/components/settings/settings-fields";
import { saveAgendaDisplayAction } from "@/lib/agenda-preferences-actions";
import { MAX_DAY_HOUR, MIN_DAY_HOUR, SLOT_LABELS, SLOT_MINUTES, type AgendaDisplay, type Density } from "@/lib/agenda-display";
import { notify } from "@/lib/notify";

const DENSITY_LABELS: Record<Density, string> = { compact: "Compact", comfortable: "Confortable" };
const HOURS = Array.from({ length: MAX_DAY_HOUR - MIN_DAY_HOUR + 1 }, (_, index) => MIN_DAY_HOUR + index);
const hourLabel = (hour: number) => `${String(hour).padStart(2, "0")}:00`;

/**
 * « Affichage » de l'agenda : un bouton qui déplie un panneau sous lui.
 * Chaque réglage s'applique aussitôt à l'écran ; seul « Définir comme
 * affichage par défaut » l'enregistre pour le compte.
 *
 * Panneau positionné sous son bouton (et non en couche supérieure ancrée :
 * l'ancrage CSS n'est pas encore pris en charge partout). Échap ou un clic
 * ailleurs le referme et rend le focus au bouton.
 */
export function AgendaDisplayMenu({ value, onChange }: { value: AgendaDisplay; onChange: (next: AgendaDisplay) => void }) {
  const [open, setOpen] = useState(false);
  const [saving, startSaving] = useTransition();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function set<K extends keyof AgendaDisplay>(key: K, next: AgendaDisplay[K]) {
    onChange({ ...value, [key]: next });
  }

  function saveAsDefault() {
    startSaving(async () => {
      const result = await saveAgendaDisplayAction(value);
      if (result.ok) notify.success("Affichage enregistré : il sera retrouvé à chaque ouverture de l’agenda.");
      else notify.error(result.error);
    });
  }

  return (
    <div ref={wrapperRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-controls={panelId}
        className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-extrabold text-animeo-dark transition hover:border-animeo ${open ? "border-animeo bg-animeo-soft" : "border-animeo-border bg-white"}`}
      >
        <Settings2 aria-hidden="true" className="h-4 w-4" />
        Affichage
        <ChevronDown aria-hidden="true" className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open ? (
        <div
          id={panelId}
          role="group"
          aria-labelledby={titleId}
          className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-[min(20.5rem,calc(100vw-2rem))] rounded-[18px] border border-animeo-border bg-white p-4 shadow-[0_18px_40px_rgb(var(--theme-shadow-rgb)/0.16)]"
        >
          <p id={titleId} className="text-sm font-black text-animeo-dark">Affichage de l’agenda</p>

          <Segmented
            label="Intervalle de temps"
            options={SLOT_MINUTES.map((minutes) => ({ value: minutes, label: SLOT_LABELS[minutes] }))}
            value={value.slotMinutes}
            onChange={(next) => set("slotMinutes", next)}
          />
          <Segmented
            label="Densité d’affichage"
            options={(["compact", "comfortable"] as const).map((density) => ({ value: density, label: DENSITY_LABELS[density] }))}
            value={value.density}
            onChange={(next) => set("density", next)}
          />

          <fieldset className="mt-4">
            <legend className="mb-2 text-xs font-extrabold text-animeo-muted">Horaires visibles</legend>
            <div className="flex items-center gap-2">
              <HourSelect label="Début" value={value.dayStart} hours={HOURS.filter((hour) => hour < value.dayEnd)} onChange={(next) => set("dayStart", next)} />
              <span aria-hidden="true" className="text-animeo-muted">→</span>
              <HourSelect label="Fin" value={value.dayEnd} hours={HOURS.filter((hour) => hour > value.dayStart)} onChange={(next) => set("dayEnd", next)} />
            </div>
          </fieldset>

          <div className="mt-4 space-y-2">
            <SwitchRow label="Afficher le samedi" checked={value.showSaturday} onChange={(next) => set("showSaturday", next)} />
            <SwitchRow label="Afficher le dimanche" checked={value.showSunday} onChange={(next) => set("showSunday", next)} />
            <SwitchRow label="Afficher les zones fermées" checked={value.showClosedZones} onChange={(next) => set("showClosedZones", next)} />
          </div>

          <button
            type="button"
            onClick={saveAsDefault}
            disabled={saving}
            className="mt-4 w-full rounded-xl border border-animeo-dark px-4 py-2.5 text-sm font-extrabold text-animeo-dark transition hover:bg-animeo-soft disabled:opacity-60"
          >
            {saving ? "Enregistrement…" : "Définir comme affichage par défaut"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** Choix exclusif en boutons côte à côte ; la valeur active est pleine. */
function Segmented<T extends string | number>({ label, options, value, onChange }: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (next: T) => void;
}) {
  const labelId = useId();
  return (
    <div className="mt-4">
      <p id={labelId} className="mb-2 text-xs font-extrabold text-animeo-muted">{label}</p>
      <div role="group" aria-labelledby={labelId} className="flex gap-1 rounded-xl bg-animeo-bg p-1">
        {options.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={String(option.value)}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(option.value)}
              className={`min-h-11 flex-1 whitespace-nowrap rounded-lg px-1.5 text-xs font-extrabold transition sm:min-h-9 ${active ? "bg-animeo text-white shadow-sm" : "text-animeo-dark hover:bg-white"}`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function HourSelect({ label, value, hours, onChange }: { label: string; value: number; hours: number[]; onChange: (next: number) => void }) {
  return (
    <select
      aria-label={`${label} des horaires visibles`}
      value={value}
      onChange={(event) => onChange(Number(event.target.value))}
      className="h-10 flex-1 rounded-xl border border-animeo-border bg-white px-3 text-sm font-bold text-animeo-dark outline-none focus:border-animeo"
    >
      {hours.map((hour) => <option key={hour} value={hour}>{hourLabel(hour)}</option>)}
    </select>
  );
}

function SwitchRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (next: boolean) => void }) {
  const labelId = useId();
  return (
    <div className="flex items-center justify-between gap-3">
      <span id={labelId} className="text-sm font-bold text-animeo-dark">{label}</span>
      <Toggle compact checked={checked} onChange={onChange} label={checked ? "Oui" : "Non"} labelledBy={labelId} />
    </div>
  );
}
