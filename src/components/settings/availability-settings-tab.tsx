"use client";

import { useState, type FormEvent } from "react";
import { Card } from "@/components/ui/card";
import { Field, SectionTitle, Toggle, inputClassName } from "@/components/settings/settings-fields";
import type { AvailabilitySettings, ExceptionalClosure, TimeSlot, Vacation } from "@/data/settings";

type AvailabilitySettingsTabProps = {
  value: AvailabilitySettings;
  onChange: (value: AvailabilitySettings, message: string) => void;
};

const emptyClosure: Omit<ExceptionalClosure, "id"> = { date: "", start: "09:00", end: "18:00", scope: "Tout fermer", reason: "" };
const emptyVacation = { startDate: "", endDate: "" };

export function AvailabilitySettingsTab({ value, onChange }: AvailabilitySettingsTabProps) {
  const [draft, setDraft] = useState(value);
  const [showClosureForm, setShowClosureForm] = useState(false);
  const [showVacationForm, setShowVacationForm] = useState(false);
  const [closure, setClosure] = useState(emptyClosure);
  const [vacation, setVacation] = useState(emptyVacation);

  function updateDay(dayId: string, updater: (day: AvailabilitySettings["days"][number]) => AvailabilitySettings["days"][number]) {
    setDraft((current) => ({ ...current, days: current.days.map((day) => day.id === dayId ? updater(day) : day) }));
  }

  function updateSlot(dayId: string, slotId: string, key: keyof TimeSlot, next: string | boolean) {
    updateDay(dayId, (day) => ({ ...day, slots: day.slots.map((slot) => slot.id === slotId ? { ...slot, [key]: next } : slot) }));
  }

  function addSlot(dayId: string) {
    updateDay(dayId, (day) => ({ ...day, enabled: true, slots: [...day.slots, { id: `slot-${Date.now()}`, start: "09:00", end: "12:00", cabinet: true, home: true }] }));
  }

  function addClosure(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next: ExceptionalClosure = { ...closure, id: `closure-${Date.now()}` };
    setDraft((current) => ({ ...current, closures: [...current.closures, next] }));
    setClosure(emptyClosure);
    setShowClosureForm(false);
  }

  function addVacation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next: Vacation = { ...vacation, id: `vacation-${Date.now()}` };
    setDraft((current) => ({ ...current, vacations: [...current.vacations, next] }));
    setVacation(emptyVacation);
    setShowVacationForm(false);
  }

  return (
    <div className="space-y-6">
      <Card className="p-5 sm:p-6">
        <SectionTitle title="Disponibilités habituelles" description="Cabinet et Domicile peuvent être ouverts indépendamment sur chaque plage." />
        <div className="space-y-3">
          {draft.days.map((day) => (
            <div key={day.id} className={`rounded-2xl border p-4 ${day.enabled ? "border-[#dce8e5] bg-white" : "border-transparent bg-animeo-bg"}`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className={`flex h-10 w-10 items-center justify-center rounded-xl text-sm font-black ${day.enabled ? "bg-animeo-soft text-animeo-dark" : "bg-[#e7ebeb] text-animeo-muted"}`}>{day.label.slice(0, 2)}</span>
                  <div><h3 className="font-black text-animeo-dark">{day.label}</h3><p className="text-xs text-animeo-muted">{day.enabled ? `${day.slots.length} plage${day.slots.length > 1 ? "s" : ""}` : "Fermé"}</p></div>
                </div>
                <Toggle checked={day.enabled} onChange={(enabled) => updateDay(day.id, (current) => ({ ...current, enabled, slots: enabled && current.slots.length === 0 ? [{ id: `slot-${day.id}`, start: "09:00", end: "18:00", cabinet: true, home: true }] : current.slots }))} label={day.enabled ? "Activé" : "Fermé"} />
              </div>

              {day.enabled ? (
                <div className="mt-4 space-y-2 border-t border-[#e4ecea] pt-4">
                  {day.slots.map((slot) => (
                    <div key={slot.id} className="grid gap-3 rounded-2xl bg-animeo-bg p-3 lg:grid-cols-[130px_20px_130px_minmax(260px,1fr)_36px] lg:items-center">
                      <input type="time" aria-label={`Début ${day.label}`} value={slot.start} onChange={(event) => updateSlot(day.id, slot.id, "start", event.target.value)} className={inputClassName} />
                      <span className="hidden text-center font-black text-animeo-muted lg:block">–</span>
                      <input type="time" aria-label={`Fin ${day.label}`} value={slot.end} onChange={(event) => updateSlot(day.id, slot.id, "end", event.target.value)} className={inputClassName} />
                      <div className="flex flex-wrap gap-2">
                        <Toggle checked={slot.cabinet} onChange={(checked) => updateSlot(day.id, slot.id, "cabinet", checked)} label={`Cabinet : ${slot.cabinet ? "OUI" : "NON"}`} compact />
                        <Toggle checked={slot.home} onChange={(checked) => updateSlot(day.id, slot.id, "home", checked)} label={`Domicile : ${slot.home ? "OUI" : "NON"}`} compact />
                      </div>
                      <button type="button" onClick={() => updateDay(day.id, (current) => ({ ...current, slots: current.slots.filter((item) => item.id !== slot.id) }))} aria-label="Supprimer la plage" className="flex h-9 w-9 items-center justify-center rounded-xl text-lg font-bold text-[#a9573b] hover:bg-[#fff0eb]">×</button>
                    </div>
                  ))}
                  <button type="button" onClick={() => addSlot(day.id)} className="rounded-xl border border-animeo px-4 py-2 text-xs font-extrabold text-animeo">+ Ajouter une plage horaire</button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-5 sm:p-6">
        <SectionTitle title="Temps de déplacement" description="Après un rendez-vous à domicile, ce délai reste bloqué dans l’agenda avant qu’un autre rendez-vous (cabinet ou domicile) puisse commencer." />
        <div className="max-w-sm"><Field label="Temps minimum après un rendez-vous à domicile"><select value={draft.travelBuffer} onChange={(event) => setDraft((current) => ({ ...current, travelBuffer: Number(event.target.value) }))} className={inputClassName}>{[0, 15, 30, 45, 60].map((minutes) => <option key={minutes} value={minutes}>{minutes} minute{minutes > 1 ? "s" : ""}</option>)}</select></Field></div>
      </Card>

      <Card className="p-5 sm:p-6">
        <SectionTitle title="Durée des rendez-vous" description="Ces réglages pilotent la prise de rendez-vous en ligne et le formulaire de création de prestation — chaque rendez-vous ou prestation reste ensuite librement modifiable." />
        <div className="grid gap-4 sm:max-w-xl sm:grid-cols-2">
          <Field label="Durée par défaut d’une prestation">
            <select value={draft.defaultAppointmentDuration} onChange={(event) => setDraft((current) => ({ ...current, defaultAppointmentDuration: Number(event.target.value) }))} className={inputClassName}>
              {[15, 30, 45, 60, 90].map((minutes) => <option key={minutes} value={minutes}>{minutes} minutes</option>)}
            </select>
          </Field>
          <Field label="Pas des créneaux proposés en ligne">
            <select value={draft.slotInterval} onChange={(event) => setDraft((current) => ({ ...current, slotInterval: Number(event.target.value) }))} className={inputClassName}>
              {[10, 15, 20, 30].map((minutes) => <option key={minutes} value={minutes}>{minutes} minutes</option>)}
            </select>
          </Field>
        </div>
      </Card>

      <Card className="p-5 sm:p-6">
        <SectionTitle
          title="Fermetures exceptionnelles"
          description="Bloquez ponctuellement le Cabinet, le Domicile ou les deux."
          action={<div className="flex flex-wrap gap-2"><button type="button" onClick={() => setShowClosureForm(!showClosureForm)} className="rounded-xl border border-animeo px-4 py-2.5 text-xs font-extrabold text-animeo">+ Ajouter une fermeture</button><button type="button" onClick={() => setShowVacationForm(!showVacationForm)} className="rounded-xl bg-animeo px-4 py-2.5 text-xs font-extrabold text-white">+ Ajouter des vacances</button></div>}
        />

        {showClosureForm ? (
          <form onSubmit={addClosure} className="mb-4 grid gap-3 rounded-2xl bg-animeo-bg p-4 md:grid-cols-2 xl:grid-cols-5">
            <Field label="Date"><input type="date" value={closure.date} onChange={(event) => setClosure((current) => ({ ...current, date: event.target.value }))} className={inputClassName} required /></Field>
            <Field label="Début"><input type="time" value={closure.start} onChange={(event) => setClosure((current) => ({ ...current, start: event.target.value }))} className={inputClassName} required /></Field>
            <Field label="Fin"><input type="time" value={closure.end} onChange={(event) => setClosure((current) => ({ ...current, end: event.target.value }))} className={inputClassName} required /></Field>
            <Field label="Portée"><select value={closure.scope} onChange={(event) => setClosure((current) => ({ ...current, scope: event.target.value as ExceptionalClosure["scope"] }))} className={inputClassName}><option>Cabinet uniquement</option><option>Domicile uniquement</option><option>Tout fermer</option></select></Field>
            <Field label="Motif facultatif"><input value={closure.reason} onChange={(event) => setClosure((current) => ({ ...current, reason: event.target.value }))} className={inputClassName} /></Field>
            <div className="flex gap-2 md:col-span-2 xl:col-span-5"><button type="submit" className="rounded-xl bg-animeo px-4 py-2 text-xs font-extrabold text-white">Ajouter</button><button type="button" onClick={() => setShowClosureForm(false)} className="rounded-xl px-4 py-2 text-xs font-extrabold text-animeo-muted">Annuler</button></div>
          </form>
        ) : null}

        {showVacationForm ? (
          <form onSubmit={addVacation} className="mb-4 grid gap-3 rounded-2xl bg-animeo-bg p-4 md:grid-cols-2">
            <Field label="Date de début"><input type="date" value={vacation.startDate} onChange={(event) => setVacation((current) => ({ ...current, startDate: event.target.value }))} className={inputClassName} required /></Field>
            <Field label="Date de fin"><input type="date" min={vacation.startDate} value={vacation.endDate} onChange={(event) => setVacation((current) => ({ ...current, endDate: event.target.value }))} className={inputClassName} required /></Field>
            <div className="flex gap-2 md:col-span-2"><button type="submit" className="rounded-xl bg-animeo px-4 py-2 text-xs font-extrabold text-white">Ajouter les vacances</button><button type="button" onClick={() => setShowVacationForm(false)} className="rounded-xl px-4 py-2 text-xs font-extrabold text-animeo-muted">Annuler</button></div>
          </form>
        ) : null}

        <div className="space-y-2">
          {draft.closures.map((item) => <ClosureRow key={item.id} title={`${item.date} · ${item.start} – ${item.end}`} subtitle={`${item.scope}${item.reason ? ` · ${item.reason}` : ""}`} onRemove={() => setDraft((current) => ({ ...current, closures: current.closures.filter((closureItem) => closureItem.id !== item.id) }))} />)}
          {draft.vacations.map((item) => <ClosureRow key={item.id} title={`Vacances · ${item.startDate} au ${item.endDate}`} subtitle="Cabinet et Domicile fermés" onRemove={() => setDraft((current) => ({ ...current, vacations: current.vacations.filter((vacationItem) => vacationItem.id !== item.id) }))} />)}
          {draft.closures.length === 0 && draft.vacations.length === 0 ? <p className="rounded-2xl bg-animeo-bg p-4 text-sm text-animeo-muted">Aucune fermeture programmée.</p> : null}
        </div>
      </Card>

      <div className="flex justify-end"><button type="button" onClick={() => onChange(draft, "Disponibilités enregistrées")} className="rounded-2xl bg-animeo px-6 py-3 text-sm font-extrabold text-white shadow-sm">Enregistrer les disponibilités</button></div>
    </div>
  );
}

function ClosureRow({ title, subtitle, onRemove }: { title: string; subtitle: string; onRemove: () => void }) {
  return <div className="flex items-center justify-between gap-4 rounded-2xl border border-[#dfe9e6] p-4"><div><p className="font-extrabold text-animeo-dark">{title}</p><p className="text-xs text-animeo-muted">{subtitle}</p></div><button type="button" onClick={onRemove} className="rounded-xl bg-[#fff0eb] px-3 py-2 text-xs font-extrabold text-[#a9573b]">Supprimer</button></div>;
}
