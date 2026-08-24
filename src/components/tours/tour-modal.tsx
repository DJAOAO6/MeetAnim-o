"use client";

import { useState, type FormEvent } from "react";
import { Icon } from "@/components/ui/icon";
import type { Tour, Zone } from "@/data/tours";

export type TourFormValue = {
  id?: string;
  name: string;
  recurrence: Tour["recurrence"];
  day: string;
  startTime: string;
  endTime: string;
  zoneId: string;
  status: Tour["status"];
};

type TourModalProps = {
  tour?: Tour;
  zones: Zone[];
  onClose: () => void;
  onSave: (value: TourFormValue) => void;
  onCreateZone: () => void;
};

const days = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
const inputClassName = "h-11 w-full rounded-xl border border-[#d9e5e2] bg-animeo-bg px-3.5 text-sm font-semibold text-animeo-dark outline-none transition focus:border-animeo focus:bg-white";

export function TourModal({ tour, zones, onClose, onSave, onCreateZone }: TourModalProps) {
  const [name, setName] = useState(tour?.name ?? "");
  const [recurrence, setRecurrence] = useState<Tour["recurrence"]>(tour?.recurrence ?? "Toutes les semaines");
  const [day, setDay] = useState(tour?.day ?? "Lundi");
  const [startTime, setStartTime] = useState(tour?.startTime ?? "09:00");
  const [endTime, setEndTime] = useState(tour?.endTime ?? "18:00");
  const [zoneId, setZoneId] = useState(tour?.zoneId ?? zones[0]?.id ?? "");
  const [status, setStatus] = useState<Tour["status"]>(tour?.status ?? "Active");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave({ id: tour?.id, name: name.trim(), recurrence, day, startTime, endTime, zoneId, status });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#102f37]/55 p-4 backdrop-blur-sm" role="presentation">
      <section role="dialog" aria-modal="true" aria-labelledby="tour-dialog-title" className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-[18px] bg-white shadow-[0_24px_70px_rgba(12,39,47,0.3)]">
        <div className="flex items-start justify-between border-b border-[#e5eeeb] bg-gradient-to-r from-animeo-soft to-white p-5 sm:p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-animeo text-white"><Icon name="tournees" className="h-6 w-6" /></div>
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-animeo">Consultations à domicile</p>
              <h2 id="tour-dialog-title" className="mt-1 text-2xl font-black text-animeo-dark">{tour ? "Modifier la tournée" : "Créer une tournée"}</h2>
              <p className="mt-1 text-sm text-animeo-muted">Associez un jour et des horaires à une zone existante.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Fermer la fenêtre" className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-xl text-animeo-muted shadow-sm">×</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="grid gap-5 p-5 sm:grid-cols-2 sm:p-6">
            <Field label="Nom de la tournée" wide>
              <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex. Tournée Le Havre" className={inputClassName} required />
            </Field>

            <Field label="Récurrence">
              <select value={recurrence} onChange={(event) => setRecurrence(event.target.value as Tour["recurrence"])} className={inputClassName}>
                <option value="Toutes les semaines">Toutes les semaines</option>
                <option value="Une seule fois">Une seule fois</option>
              </select>
            </Field>

            <Field label="Jour">
              <select value={day} onChange={(event) => setDay(event.target.value)} className={inputClassName}>
                {days.map((item) => <option key={item} value={item}>{item.toLocaleLowerCase("fr-FR")}</option>)}
              </select>
            </Field>

            <Field label="Heure de début">
              <input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} className={inputClassName} required />
            </Field>

            <Field label="Heure de fin">
              <input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} className={inputClassName} required />
            </Field>

            <Field label="Zone">
              <select value={zoneId} onChange={(event) => setZoneId(event.target.value)} className={inputClassName} required>
                {zones.map((zone) => <option key={zone.id} value={zone.id}>{zone.name}</option>)}
              </select>
            </Field>

            <div className="flex items-end">
              <button type="button" onClick={onCreateZone} className="h-11 w-full rounded-xl border border-animeo px-3.5 text-sm font-extrabold text-animeo transition hover:bg-animeo-soft">+ Créer une zone</button>
            </div>

            <Field label="Statut" wide>
              <div className="inline-flex rounded-xl bg-animeo-soft p-1">
                {(["Active", "Inactive"] as const).map((item) => (
                  <button key={item} type="button" onClick={() => setStatus(item)} aria-pressed={status === item} className={`rounded-lg px-5 py-2 text-sm font-extrabold transition ${status === item ? "bg-white text-animeo-dark shadow-sm" : "text-animeo-muted"}`}>{item}</button>
                ))}
              </div>
            </Field>

            <div className="sm:col-span-2 rounded-2xl border border-[#cfe7e1] bg-animeo-soft p-4 text-xs font-semibold leading-relaxed text-animeo-dark">
              Une tournée correspond à <strong>un jour + des horaires + une zone</strong>. Elle servira plus tard à proposer les créneaux domicile compatibles avec la ville du client.
            </div>
          </div>

          <div className="flex flex-col-reverse gap-2 border-t border-[#e5eeeb] p-5 sm:flex-row sm:justify-end sm:p-6">
            <button type="button" onClick={onClose} className="rounded-xl border border-[#d4e2df] px-5 py-2.5 text-sm font-extrabold text-animeo-dark transition hover:bg-animeo-bg">Annuler</button>
            <button type="submit" disabled={!zones.length} className="rounded-xl bg-animeo px-5 py-2.5 text-sm font-extrabold text-white transition hover:bg-[#459e90] disabled:cursor-not-allowed disabled:opacity-50">{tour ? "Enregistrer" : "Créer la tournée"}</button>
          </div>
        </form>
      </section>
    </div>
  );
}

function Field({ label, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <label className={wide ? "sm:col-span-2" : ""}>
      <span className="mb-2 block text-xs font-extrabold uppercase tracking-[0.11em] text-animeo-muted">{label}</span>
      {children}
    </label>
  );
}
