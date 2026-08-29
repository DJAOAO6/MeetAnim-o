"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import { useModalFocusTrap } from "@/components/ui/use-modal-focus-trap";
import type { Reminder } from "@/data/reminders";

type ReminderModalProps = {
  reminder: Reminder;
  onClose: () => void;
  onSend: (reminder: Reminder) => void;
};

export function ReminderModal({ reminder, onClose, onSend }: ReminderModalProps) {
  const [message, setMessage] = useState(
    `Bonjour ${reminder.clientFirstName},\n\nCela fait bientôt ${reminder.delay} depuis la dernière séance de ${reminder.animalName}.\n\nSi vous souhaitez prévoir une nouvelle consultation, vous pouvez prendre rendez-vous directement ici :\n\n[Lien de réservation]`,
  );
  const dialogRef = useModalFocusTrap<HTMLElement>(onClose);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#102f37]/55 p-4 backdrop-blur-sm" role="presentation">
      <section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="reminder-dialog-title" className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[18px] border border-white/20 bg-white shadow-[0_24px_70px_rgba(12,39,47,0.3)] outline-none">
        <div className="flex items-start justify-between border-b border-[#e5eeeb] bg-gradient-to-r from-animeo-soft to-white p-5 sm:p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-animeo text-white">
              <Icon name="bell" className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-animeo">Simulation locale</p>
              <h2 id="reminder-dialog-title" className="mt-1 text-2xl font-black text-animeo-dark">Envoyer un rappel</h2>
              <p className="mt-1 text-sm text-animeo-muted">Aucun email ne sera réellement envoyé.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Fermer la fenêtre" className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-xl text-animeo-muted shadow-sm transition hover:text-animeo-dark">×</button>
        </div>

        <div className="space-y-5 p-5 sm:p-6">
          <div className="grid gap-3 sm:grid-cols-2">
            <InfoCard label="Destinataire" value={reminder.clientName} />
            <InfoCard label="Animal" value={`${reminder.animalName} · ${reminder.animalSpecies}`} />
          </div>

          <label className="block">
            <span className="mb-2 block text-xs font-extrabold uppercase tracking-[0.11em] text-animeo-muted">Message</span>
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              rows={10}
              className="w-full resize-none rounded-2xl border border-[#d9e5e2] bg-animeo-bg p-4 text-sm font-semibold leading-relaxed text-animeo-dark outline-none transition focus:border-animeo focus:bg-white"
            />
          </label>

          <div className="rounded-2xl border border-[#f1d89f] bg-[#fff9ec] px-4 py-3 text-xs font-semibold leading-relaxed text-[#8c6118]">
            Le lien de réservation est un exemple. Il sera remplacé plus tard par l’adresse publique propre au professionnel.
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-[#e5eeeb] p-5 sm:flex-row sm:justify-end sm:p-6">
          <button type="button" onClick={onClose} className="rounded-xl border border-[#d4e2df] bg-white px-5 py-2.5 text-sm font-extrabold text-animeo-dark transition hover:bg-animeo-bg">Annuler</button>
          <button type="button" onClick={() => onSend(reminder)} disabled={!message.trim()} className="rounded-xl bg-animeo px-5 py-2.5 text-sm font-extrabold text-white transition hover:bg-[#459e90] disabled:cursor-not-allowed disabled:opacity-50">Envoyer le rappel</button>
        </div>
      </section>
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-animeo-bg p-4">
      <p className="text-[10px] font-extrabold uppercase tracking-[0.11em] text-animeo-muted">{label}</p>
      <p className="mt-1 font-extrabold text-animeo-dark">{value}</p>
    </div>
  );
}
