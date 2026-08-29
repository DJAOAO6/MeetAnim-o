"use client";

import { useState, type FormEvent } from "react";
import { useModalFocusTrap } from "@/components/ui/use-modal-focus-trap";
import { useUnsavedChangesWarning } from "@/components/ui/use-unsaved-changes-warning";
import type { CreateBlockedSlotInput } from "@/lib/blocked-slots-actions";

type BlockedSlotModalProps = {
  initialDate: string;
  onClose: () => void;
  onSave: (input: CreateBlockedSlotInput) => Promise<{ ok: boolean; error?: string }>;
};

const inputClassName = "h-11 w-full rounded-xl border border-[#d9e5e2] bg-animeo-bg px-3.5 text-sm font-semibold text-animeo-dark outline-none transition focus:border-animeo focus:bg-white";
const durationOptions = [30, 60, 90, 120, 180];
const reasonSuggestions = ["Pause déjeuner", "Congés", "Formation", "Absence"];

function addMinutes(time: string, minutes: number): string {
  const [hours, mins] = time.split(":").map(Number);
  const total = hours * 60 + mins + minutes;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export function BlockedSlotModal({ initialDate, onClose, onSave }: BlockedSlotModalProps) {
  const [date, setDate] = useState(initialDate);
  const [startTime, setStartTime] = useState("12:00");
  const [duration, setDuration] = useState(60);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initialSnapshot] = useState(() => JSON.stringify({ date, startTime, duration, reason }));
  const isDirty = JSON.stringify({ date, startTime, duration, reason }) !== initialSnapshot;
  const { confirmDiscard } = useUnsavedChangesWarning(isDirty);
  function guardedClose() {
    if (confirmDiscard()) onClose();
  }
  const dialogRef = useModalFocusTrap<HTMLElement>(guardedClose);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const result = await onSave({ date, startTime, endTime: addMinutes(startTime, duration), reason: reason.trim() || undefined });
    setPending(false);
    if (!result.ok) {
      setError(result.error ?? "Une erreur est survenue.");
      return;
    }
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#102f37]/55 p-4 backdrop-blur-sm" role="presentation">
      <section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="blocked-slot-dialog-title" className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-[18px] bg-white shadow-[0_24px_70px_rgba(12,39,47,0.3)] outline-none">
        <div className="flex items-start justify-between border-b border-[#e5eeeb] bg-gradient-to-r from-animeo-soft to-white p-5">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-animeo-dark text-white"><LockIcon /></div>
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-animeo">Agenda unique</p>
              <h2 id="blocked-slot-dialog-title" className="mt-1 text-xl font-black text-animeo-dark">Bloquer un créneau</h2>
              <p className="mt-1 text-sm text-animeo-muted">Ce créneau sera indisponible au cabinet et à domicile.</p>
            </div>
          </div>
          <button type="button" onClick={guardedClose} aria-label="Fermer la fenêtre" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-xl text-animeo-muted shadow-sm">×</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="flex flex-col gap-4 p-5">
            <Field label="Date">
              <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className={inputClassName} required />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Heure de début">
                <input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} className={inputClassName} required />
              </Field>
              <Field label="Durée">
                <select value={duration} onChange={(event) => setDuration(Number(event.target.value))} className={inputClassName}>
                  {durationOptions.map((option) => (
                    <option key={option} value={option}>{option < 60 ? `${option} min` : `${Math.floor(option / 60)}h${option % 60 ? String(option % 60).padStart(2, "0") : ""}`}</option>
                  ))}
                </select>
              </Field>
            </div>

            <Field label="Motif" hint="Facultatif">
              <input
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                list="blocked-slot-reasons"
                placeholder="Ex. Pause déjeuner"
                className={inputClassName}
              />
              <datalist id="blocked-slot-reasons">
                {reasonSuggestions.map((suggestion) => <option key={suggestion} value={suggestion} />)}
              </datalist>
            </Field>

            {error ? <p className="rounded-xl bg-[#fff0eb] px-3.5 py-2.5 text-sm font-bold text-[#a9573b]">{error}</p> : null}
          </div>

          <div className="flex flex-col-reverse gap-2 border-t border-[#e5eeeb] p-5 sm:flex-row sm:justify-end">
            <button type="button" onClick={guardedClose} className="rounded-xl border border-[#d4e2df] px-5 py-2.5 text-sm font-extrabold text-animeo-dark transition hover:bg-animeo-bg">Annuler</button>
            <button type="submit" disabled={pending} className="rounded-xl bg-animeo-dark px-5 py-2.5 text-sm font-extrabold text-white transition hover:bg-[#12303a] disabled:cursor-not-allowed disabled:opacity-60">
              {pending ? "Blocage…" : "Bloquer ce créneau"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label>
      <span className="mb-2 flex items-center justify-between text-xs font-extrabold uppercase tracking-[0.11em] text-animeo-muted">
        {label}
        {hint ? <span className="normal-case tracking-normal text-[#9aa5a8]">{hint}</span> : null}
      </span>
      {children}
    </label>
  );
}

function LockIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
      <rect x="5" y="10" width="14" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  );
}
