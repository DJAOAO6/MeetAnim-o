"use client";

import { useState, type FormEvent } from "react";
import { useManualAvailability, type AvailabilityMode, type ClosureDuration, type ModeAvailability } from "@/components/availability/manual-availability";

const durations: ClosureDuration[] = ["1 heure", "2 heures", "Demi-journée", "Journée entière", "Plusieurs jours", "Horaire personnalisé", "Jusqu’à réouverture manuelle"];

export function DashboardAvailabilityControls() {
  const { availability, setModeAvailability } = useManualAvailability();
  const [editingMode, setEditingMode] = useState<AvailabilityMode | null>(null);

  return (
    <>
      <section aria-label="Ouverture manuelle des réservations" className="mb-6 flex flex-wrap items-center gap-3">
        <AvailabilityBadge label="Cabinet" value={availability.cabinet} onClick={() => setEditingMode("cabinet")} />
        <AvailabilityBadge label="Domicile" value={availability.home} onClick={() => setEditingMode("home")} />
        <p role="status" className="text-xs text-animeo-muted sm:ml-1">
          {modeSummary("Cabinet", availability.cabinet)} · {modeSummary("Domicile", availability.home)}
        </p>
      </section>

      {editingMode ? (
        <AvailabilityModal
          key={editingMode}
          mode={editingMode}
          value={availability[editingMode]}
          onClose={() => setEditingMode(null)}
          onSave={(value) => { setModeAvailability(editingMode, value); setEditingMode(null); }}
        />
      ) : null}
    </>
  );
}

function AvailabilityBadge({ label, value, onClick }: { label: string; value: ModeAvailability; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label={`Modifier ${label}`} className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-extrabold transition ${value.open ? "border-[#cfe7e1] bg-white text-animeo-dark hover:bg-animeo-soft" : "border-[#d9dfdf] bg-[#eef1f1] text-animeo-muted hover:bg-white"}`}>
      <span className={`h-2.5 w-2.5 rounded-full ${value.open ? "bg-animeo shadow-[0_0_0_4px_rgba(79,175,159,0.14)]" : "bg-[#E05D5D] shadow-[0_0_0_4px_rgba(224,93,93,0.14)]"}`} />
      {label} {value.open ? "ouvert" : "fermé"}
      <span aria-hidden="true" className="ml-1 text-xs opacity-60">Modifier</span>
    </button>
  );
}

function AvailabilityModal({ mode, value, onClose, onSave }: { mode: AvailabilityMode; value: ModeAvailability; onClose: () => void; onSave: (value: ModeAvailability) => void }) {
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const label = mode === "cabinet" ? "Cabinet" : "Domicile";

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (draft.duration === "Horaire personnalisé" && draft.endTime <= draft.startTime) {
      setError("L’heure de fin doit être postérieure à l’heure de début.");
      return;
    }
    if (draft.duration === "Plusieurs jours" && draft.endDate < draft.date) {
      setError("La date de fin doit être postérieure ou égale à la date de début.");
      return;
    }
    onSave(draft);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#102f37]/55 p-4 backdrop-blur-sm">
      <section role="dialog" aria-modal="true" aria-labelledby="availability-title" className="w-full max-w-lg overflow-hidden rounded-[18px] bg-white shadow-[0_24px_70px_rgba(12,39,47,0.3)]">
        <div className="flex items-start justify-between border-b border-[#e1eae8] bg-animeo-soft p-5 sm:p-6">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.13em] text-animeo">Ouverture manuelle</p>
            <h2 id="availability-title" className="mt-1 text-2xl font-black text-animeo-dark">Modifier {label}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Fermer" className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-xl text-animeo-muted">×</button>
        </div>

        <form onSubmit={submit}>
          <div className="space-y-5 p-5 sm:p-6">
            <div>
              <p className="mb-2 text-xs font-extrabold uppercase tracking-[0.1em] text-animeo-muted">État</p>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setDraft((current) => ({ ...current, open: true }))} aria-pressed={draft.open} className={`rounded-xl px-4 py-3 text-sm font-extrabold ${draft.open ? "bg-animeo text-white" : "bg-animeo-bg text-animeo-dark"}`}>Ouvert</button>
                <button type="button" onClick={() => setDraft((current) => ({ ...current, open: false }))} aria-pressed={!draft.open} className={`rounded-xl px-4 py-3 text-sm font-extrabold ${!draft.open ? "bg-animeo-dark text-white" : "bg-animeo-bg text-animeo-dark"}`}>Fermé</button>
              </div>
            </div>

            <label className="block">
              <span className="mb-2 block text-xs font-extrabold uppercase tracking-[0.1em] text-animeo-muted">{draft.duration === "Plusieurs jours" ? "Date de début" : "Date concernée"}</span>
              <input type="date" value={draft.date} min="2026-08-24" onChange={(event) => { setDraft((current) => ({ ...current, date: event.target.value })); setError(null); }} className="h-11 w-full rounded-xl border border-[#d9e5e2] bg-animeo-bg px-3.5 text-sm font-bold text-animeo-dark outline-none focus:border-animeo" />
            </label>

            <label className="block">
              <span className="mb-2 block text-xs font-extrabold uppercase tracking-[0.1em] text-animeo-muted">Durée</span>
              <select value={draft.duration} onChange={(event) => setDraft((current) => ({ ...current, duration: event.target.value as ClosureDuration }))} className="h-11 w-full rounded-xl border border-[#d9e5e2] bg-animeo-bg px-3.5 text-sm font-bold text-animeo-dark outline-none focus:border-animeo">
                {durations.map((duration) => <option key={duration}>{duration}</option>)}
              </select>
            </label>

            {draft.duration === "Plusieurs jours" ? (
              <label className="block">
                <span className="mb-2 block text-xs font-extrabold uppercase tracking-[0.1em] text-animeo-muted">Date de fin</span>
                <input type="date" value={draft.endDate} min={draft.date} onChange={(event) => { setDraft((current) => ({ ...current, endDate: event.target.value })); setError(null); }} className="h-11 w-full rounded-xl border border-[#d9e5e2] bg-animeo-bg px-3.5 text-sm font-bold text-animeo-dark outline-none focus:border-animeo" required />
              </label>
            ) : null}

            {draft.duration === "Horaire personnalisé" ? (
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-2 block text-xs font-extrabold uppercase tracking-[0.1em] text-animeo-muted">Heure de début</span>
                  <input type="time" value={draft.startTime} onChange={(event) => { setDraft((current) => ({ ...current, startTime: event.target.value })); setError(null); }} className="h-11 w-full rounded-xl border border-[#d9e5e2] bg-animeo-bg px-3.5 text-sm font-bold text-animeo-dark outline-none focus:border-animeo" required />
                </label>
                <label className="block">
                  <span className="mb-2 block text-xs font-extrabold uppercase tracking-[0.1em] text-animeo-muted">Heure de fin</span>
                  <input type="time" value={draft.endTime} onChange={(event) => { setDraft((current) => ({ ...current, endTime: event.target.value })); setError(null); }} className="h-11 w-full rounded-xl border border-[#d9e5e2] bg-animeo-bg px-3.5 text-sm font-bold text-animeo-dark outline-none focus:border-animeo" required />
                </label>
              </div>
            ) : null}

            {error ? <p role="alert" className="rounded-xl bg-[#fff0eb] px-4 py-3 text-sm font-bold text-[#a9573b]">{error}</p> : null}

            <div className={`rounded-2xl p-4 text-sm font-bold ${draft.open ? "bg-animeo-soft text-[#24755f]" : "bg-[#eef1f1] text-animeo-dark"}`}>
              Après enregistrement : {modeSummary(label, draft)}.
            </div>
          </div>

          <div className="flex flex-col-reverse gap-2 border-t border-[#e1eae8] p-5 sm:flex-row sm:justify-end">
            <button type="button" onClick={onClose} className="rounded-xl border border-[#d4e2df] px-5 py-2.5 text-sm font-extrabold text-animeo-dark">Annuler</button>
            <button type="submit" className="rounded-xl bg-animeo px-5 py-2.5 text-sm font-extrabold text-white">Enregistrer</button>
          </div>
        </form>
      </section>
    </div>
  );
}

function modeSummary(label: string, value: ModeAvailability) {
  if (!value.open && value.duration === "Plusieurs jours") {
    return `${label} fermé du ${formatDate(value.date)} au ${formatDate(value.endDate)}`;
  }
  const duration = value.duration === "Horaire personnalisé" ? `${value.startTime}–${value.endTime}` : value.duration;
  return value.open ? `${label} ouvert` : `${label} fermé le ${formatDate(value.date)} · ${duration}`;
}

function formatDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" }).format(new Date(year, month - 1, day, 12));
}
