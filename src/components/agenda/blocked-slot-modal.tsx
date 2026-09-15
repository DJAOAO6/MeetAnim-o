"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useUnsavedChangesWarning } from "@/components/ui/use-unsaved-changes-warning";
import type { CreateBlockedSlotInput } from "@/lib/blocked-slots-actions";

type BlockedSlotModalProps = {
  initialDate: string;
  onClose: () => void;
  onSave: (input: CreateBlockedSlotInput) => Promise<{ ok: boolean; error?: string }>;
};

const inputClassName = "h-11 w-full rounded-xl border border-animeo-border bg-animeo-bg px-3.5 text-sm font-semibold text-animeo-dark outline-none transition focus:border-animeo focus:bg-white";
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
    <form onSubmit={handleSubmit}>
      <Modal
        title="Bloquer un créneau"
        description="Ce créneau sera indisponible au cabinet et à domicile."
        onClose={guardedClose}
        size="sm"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={guardedClose}>Annuler</Button>
            <Button type="submit" disabled={pending}>{pending ? "Blocage…" : "Bloquer ce créneau"}</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
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

            {error ? <p className="rounded-xl bg-animeo-danger-soft px-3.5 py-2.5 text-sm font-bold text-animeo-danger">{error}</p> : null}
        </div>
      </Modal>
    </form>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label>
      <span className="mb-2 flex items-center justify-between text-xs font-extrabold uppercase tracking-[0.11em] text-animeo-muted">
        {label}
        {hint ? <span className="normal-case tracking-normal text-animeo-subtle">{hint}</span> : null}
      </span>
      {children}
    </label>
  );
}

