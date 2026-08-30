"use client";

import { useState, type FormEvent } from "react";
import { Card } from "@/components/ui/card";
import { Field, SectionTitle, Toggle, inputClassName, textareaClassName } from "@/components/settings/settings-fields";
import type { ReminderSettings } from "@/data/settings";

export function RemindersSettingsTab({ value, onSave }: { value: ReminderSettings; onSave: (value: ReminderSettings) => void }) {
  const [draft, setDraft] = useState(value);
  const preview = draft.messageTemplate
    .replaceAll("[Prénom]", "Marie")
    .replaceAll("[Durée]", draft.defaultDelay === "Aucun" ? "quelques mois" : draft.defaultDelay)
    .replaceAll("[Animal]", "Luna")
    .replaceAll("[Lien de réservation]", "animeo.fr/pauline-faucillon");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave(draft);
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <Card className="p-5 sm:p-6">
        <SectionTitle title="Rappels après consultation" description="Le délai choisi ici sert de valeur générale ; chaque prestation peut conserver son propre délai." />
        <div className="max-w-md"><Field label="Rappel proposé par défaut"><select value={draft.defaultDelay} onChange={(event) => setDraft((current) => ({ ...current, defaultDelay: event.target.value as ReminderSettings["defaultDelay"] }))} className={inputClassName}><option>3 mois</option><option>6 mois</option><option>12 mois</option><option>Aucun</option></select></Field></div>
        <div className="mt-6 grid gap-5 lg:grid-cols-2">
          <Field label="Modèle de message éditable"><textarea value={draft.messageTemplate} onChange={(event) => setDraft((current) => ({ ...current, messageTemplate: event.target.value }))} className={`${textareaClassName} min-h-64`} /></Field>
          <div><p className="mb-2 text-xs font-extrabold uppercase tracking-[0.11em] text-animeo-muted">Aperçu du message</p><div className="min-h-64 whitespace-pre-wrap rounded-2xl bg-animeo-soft p-5 text-sm leading-6 text-animeo-dark">{preview}</div></div>
        </div>
        <p className="mt-4 text-xs text-animeo-muted">Ce modèle pré-remplit le message proposé lors de l’envoi d’un rappel depuis Rappels clients — vous pourrez toujours l’ajuster avant chaque envoi.</p>
      </Card>

      <Card className="p-5 sm:p-6">
        <SectionTitle title="Rappel avant rendez-vous" description="Ce réglage sera utilisé plus tard pour automatiser les notifications de rendez-vous." />
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <Toggle checked={draft.appointmentReminderEnabled} onChange={(checked) => setDraft((current) => ({ ...current, appointmentReminderEnabled: checked }))} label={draft.appointmentReminderEnabled ? "Rappel automatique activé" : "Rappel automatique désactivé"} />
          {draft.appointmentReminderEnabled ? <div className="w-full sm:max-w-xs"><Field label="Délai"><select value={draft.appointmentReminderDelay} onChange={(event) => setDraft((current) => ({ ...current, appointmentReminderDelay: event.target.value as ReminderSettings["appointmentReminderDelay"] }))} className={inputClassName}><option>24 heures avant</option><option>48 heures avant</option></select></Field></div> : null}
        </div>
      </Card>

      <div className="flex justify-end"><button type="submit" className="rounded-2xl bg-animeo px-6 py-3 text-sm font-extrabold text-white shadow-sm">Enregistrer les rappels</button></div>
    </form>
  );
}
