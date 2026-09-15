"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useUnsavedChangesWarning } from "@/components/ui/use-unsaved-changes-warning";
import type { Reminder } from "@/data/reminders";

type ReminderModalProps = {
  reminder: Reminder;
  professionalSlug: string;
  // Modèle réglé dans Paramètres > Rappels (RemindersSettingsTab), avec les
  // mêmes jetons [Prénom]/[Durée]/[Animal]/[Lien de réservation] que son
  // aperçu — avant ce chantier, ce réglage n'avait aucun effet ici, ce
  // formulaire construisait son propre texte figé en dur.
  messageTemplate: string;
  sending: boolean;
  onClose: () => void;
  onSend: (reminder: Reminder, message: string) => void;
};

export function ReminderModal({ reminder, professionalSlug, messageTemplate, sending, onClose, onSend }: ReminderModalProps) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const bookingUrl = `${appUrl}/reserver/${professionalSlug}`;
  const initialMessage = messageTemplate
    .replaceAll("[Prénom]", reminder.clientFirstName)
    .replaceAll("[Durée]", reminder.delay)
    .replaceAll("[Animal]", reminder.animalName)
    .replaceAll("[Lien de réservation]", bookingUrl);
  const [message, setMessage] = useState(initialMessage);
  const isDirty = message !== initialMessage;
  const { confirmDiscard } = useUnsavedChangesWarning(isDirty);
  function guardedClose() {
    if (confirmDiscard()) onClose();
  }

  return (
    <Modal
      title="Envoyer un rappel"
      description={`Rappel par email — le message sera envoyé à ${reminder.clientName}.`}
      onClose={guardedClose}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={guardedClose}>Annuler</Button>
          <Button onClick={() => onSend(reminder, message)} disabled={!message.trim() || sending || !reminder.clientEmail}>
            {sending ? "Envoi…" : "Envoyer le rappel"}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
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
              className="w-full resize-none rounded-2xl border border-animeo-border bg-animeo-bg p-4 text-sm font-semibold leading-relaxed text-animeo-dark outline-none transition focus:border-animeo focus:bg-white"
            />
          </label>

          {reminder.clientEmail ? (
            <div className="rounded-2xl border border-animeo-soft-strong bg-animeo-soft px-4 py-3 text-xs font-semibold leading-relaxed text-animeo-dark">
              Envoyé à <strong>{reminder.clientEmail}</strong>.
            </div>
          ) : (
            <div className="rounded-2xl border border-animeo-warning-border bg-animeo-warning-soft px-4 py-3 text-xs font-semibold leading-relaxed text-animeo-warning">
              Aucune adresse email n’est enregistrée pour {reminder.clientName} : l’envoi échouera tant qu’elle n’aura pas été ajoutée à sa fiche client.
            </div>
          )}
        </div>
    </Modal>
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
