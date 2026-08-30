"use client";

import { useState, type FormEvent } from "react";
import { Icon } from "@/components/ui/icon";
import { useModalFocusTrap } from "@/components/ui/use-modal-focus-trap";
import type { Reminder, ReminderClientOption } from "@/data/reminders";

export type ReminderFormValue = {
  id?: string;
  clientId: string;
  animalId: string;
  dueDate: string;
  delay: Reminder["delay"];
  note: string;
};

type ReminderScheduleModalProps = {
  reminder?: Reminder;
  clients: ReminderClientOption[];
  saving: boolean;
  onClose: () => void;
  onSave: (value: ReminderFormValue) => void;
};

const inputClassName = "h-11 w-full rounded-xl border border-[#d9e5e2] bg-animeo-bg px-3.5 text-sm font-semibold text-animeo-dark outline-none transition focus:border-animeo focus:bg-white";

function defaultDueDateId(): string {
  const inSixMonths = new Date();
  inSixMonths.setMonth(inSixMonths.getMonth() + 6);
  return inSixMonths.toISOString().slice(0, 10);
}

function todayLabel(): string {
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" }).format(new Date());
}

export function ReminderScheduleModal({ reminder, clients, saving, onClose, onSave }: ReminderScheduleModalProps) {
  const initialClientId = reminder?.clientId ?? clients[0]?.id ?? "";
  const initialClient = clients.find((client) => client.id === initialClientId) ?? clients[0];
  const [clientId, setClientId] = useState(initialClientId);
  const [animalId, setAnimalId] = useState(reminder?.animalId ?? initialClient?.animals[0]?.id ?? "");
  const [dueDate, setDueDate] = useState(reminder?.dueDate ?? defaultDueDateId());
  const [delay, setDelay] = useState<Reminder["delay"]>(reminder?.delay ?? "6 mois");
  const [note, setNote] = useState(reminder?.note ?? "");
  const selectedClient = clients.find((client) => client.id === clientId) ?? clients[0];
  const dialogRef = useModalFocusTrap<HTMLElement>(onClose);

  function handleClientChange(nextClientId: string) {
    const nextClient = clients.find((client) => client.id === nextClientId);
    setClientId(nextClientId);
    setAnimalId(nextClient?.animals[0]?.id ?? "");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave({ id: reminder?.id, clientId, animalId, dueDate, delay, note: note.trim() });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#102f37]/55 p-4 backdrop-blur-sm" role="presentation">
      <section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="schedule-dialog-title" className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[18px] border border-white/20 bg-white shadow-[0_24px_70px_rgba(12,39,47,0.3)] outline-none">
        <div className="flex items-start justify-between border-b border-[#e5eeeb] bg-gradient-to-r from-animeo-soft to-white p-5 sm:p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-animeo text-white">
              <Icon name="calendar" className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-animeo">Rappel lié à un animal</p>
              <h2 id="schedule-dialog-title" className="mt-1 text-2xl font-black text-animeo-dark">
                {reminder ? "Modifier le rappel" : "Programmer un rappel"}
              </h2>
              <p className="mt-1 text-sm text-animeo-muted">Le rappel sera enregistré dans le suivi client.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Fermer la fenêtre" className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-xl text-animeo-muted shadow-sm transition hover:text-animeo-dark">×</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="grid gap-5 p-5 sm:grid-cols-2 sm:p-6">
            <Field label="Client">
              <select value={clientId} onChange={(event) => handleClientChange(event.target.value)} className={inputClassName} required>
                {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
              </select>
            </Field>

            <Field label="Animal">
              <select value={animalId} onChange={(event) => setAnimalId(event.target.value)} className={inputClassName} required>
                {selectedClient?.animals.map((animal) => <option key={animal.id} value={animal.id}>{animal.name} · {animal.species}</option>)}
              </select>
            </Field>

            <Field label="Date du rappel">
              <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} className={inputClassName} required />
            </Field>

            <Field label="Délai prévu">
              <select value={delay} onChange={(event) => setDelay(event.target.value as Reminder["delay"])} className={inputClassName} required>
                <option value="3 mois">3 mois</option>
                <option value="6 mois">6 mois</option>
                <option value="12 mois">12 mois</option>
                <option value="Date personnalisée">Date personnalisée</option>
              </select>
            </Field>

            <label className="sm:col-span-2">
              <span className="mb-2 block text-xs font-extrabold uppercase tracking-[0.11em] text-animeo-muted">Note facultative</span>
              <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={4} placeholder="Ex. suivi de mobilité à prévoir…" className="w-full resize-none rounded-2xl border border-[#d9e5e2] bg-animeo-bg p-3.5 text-sm font-semibold text-animeo-dark outline-none transition placeholder:text-[#9aa6aa] focus:border-animeo focus:bg-white" />
            </label>

            <div className="sm:col-span-2 rounded-2xl border border-[#cfe7e1] bg-animeo-soft p-4 text-xs font-semibold leading-relaxed text-animeo-dark">
              Si la date choisie est postérieure au {todayLabel()}, le rappel sera classé <strong>À venir</strong>. Il ne passera pas prématurément dans <strong>À relancer</strong>.
            </div>
          </div>

          <div className="flex flex-col-reverse gap-2 border-t border-[#e5eeeb] p-5 sm:flex-row sm:justify-end sm:p-6">
            <button type="button" onClick={onClose} className="rounded-xl border border-[#d4e2df] bg-white px-5 py-2.5 text-sm font-extrabold text-animeo-dark transition hover:bg-animeo-bg">Annuler</button>
            <button type="submit" disabled={saving} className="rounded-xl bg-animeo px-5 py-2.5 text-sm font-extrabold text-white transition hover:bg-[#459e90] disabled:cursor-not-allowed disabled:opacity-50">
              {saving ? "Enregistrement…" : reminder ? "Enregistrer les modifications" : "Programmer le rappel"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label>
      <span className="mb-2 block text-xs font-extrabold uppercase tracking-[0.11em] text-animeo-muted">{label}</span>
      {children}
    </label>
  );
}
