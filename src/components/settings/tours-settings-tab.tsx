"use client";

import Link from "next/link";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Field, SectionTitle, inputClassName } from "@/components/settings/settings-fields";
import { initialTours, initialZones, type Tour } from "@/data/tours";

let sessionTours = initialTours;

export function ToursSettingsTab({ onNotify }: { onNotify: (message: string) => void }) {
  const [tours, setTours] = useState(() => sessionTours);
  const [editingId, setEditingId] = useState<string | null>(null);

  function updateTours(next: Tour[], message: string) {
    sessionTours = next;
    setTours(next);
    onNotify(message);
  }

  function updateTour(id: string, key: keyof Tour, value: string) {
    setTours((current) => current.map((tour) => tour.id === id ? { ...tour, [key]: value } : tour));
  }

  return (
    <div>
      <SectionTitle title="Réglages des tournées" description="Retrouvez ici les paramètres essentiels sans remplacer la page complète des tournées." action={<Link href="/dashboard/tournees" className="inline-flex rounded-xl bg-animeo px-4 py-2.5 text-sm font-extrabold text-white">Gérer toutes les tournées →</Link>} />
      <div className="space-y-4">
        {tours.map((tour) => {
          const zone = initialZones.find((item) => item.id === tour.zoneId);
          const editing = editingId === tour.id;
          return (
            <Card key={tour.id} className="p-5 sm:p-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="mb-2 flex flex-wrap items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${tour.status === "Active" ? "bg-[#e5f5ef] text-[#278064]" : "bg-[#eef1f1] text-animeo-muted"}`}>{tour.status}</span><span className="text-xs font-bold text-animeo-muted">{tour.recurrence}</span></div>
                  {!editing ? <><h3 className="text-lg font-black text-animeo-dark">{tour.name}</h3><p className="mt-1 text-sm text-animeo-muted">{zone?.name} · {tour.day} · {tour.startTime} – {tour.endTime}</p></> : (
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                      <Field label="Nom"><input value={tour.name} onChange={(event) => updateTour(tour.id, "name", event.target.value)} className={inputClassName} /></Field>
                      <Field label="Zone"><select value={tour.zoneId} onChange={(event) => updateTour(tour.id, "zoneId", event.target.value)} className={inputClassName}>{initialZones.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
                      <Field label="Jour"><select value={tour.day} onChange={(event) => updateTour(tour.id, "day", event.target.value)} className={inputClassName}>{["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"].map((day) => <option key={day}>{day}</option>)}</select></Field>
                      <Field label="Début"><input type="time" value={tour.startTime} onChange={(event) => updateTour(tour.id, "startTime", event.target.value)} className={inputClassName} /></Field>
                      <Field label="Fin"><input type="time" value={tour.endTime} onChange={(event) => updateTour(tour.id, "endTime", event.target.value)} className={inputClassName} /></Field>
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <button type="button" onClick={() => { if (editing) { sessionTours = tours; onNotify("Tournée modifiée localement"); } setEditingId(editing ? null : tour.id); }} className="rounded-xl bg-animeo-soft px-4 py-2.5 text-xs font-extrabold text-animeo-dark">{editing ? "Enregistrer" : "Modifier"}</button>
                  <button type="button" onClick={() => updateTours(tours.map((item) => item.id === tour.id ? { ...item, status: item.status === "Active" ? "Inactive" : "Active" } : item), tour.status === "Active" ? "Tournée désactivée" : "Tournée activée")} className="rounded-xl bg-animeo-bg px-4 py-2.5 text-xs font-extrabold text-animeo-muted">{tour.status === "Active" ? "Désactiver" : "Activer"}</button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
      <p className="mt-5 rounded-2xl bg-animeo-soft p-4 text-sm text-animeo-dark"><strong>Rappel :</strong> une zone regroupe des villes et codes postaux ; une tournée associe cette zone à un jour et des horaires.</p>
    </div>
  );
}
