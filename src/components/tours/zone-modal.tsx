"use client";

import { useState, type FormEvent } from "react";
import { Icon } from "@/components/ui/icon";
import { useModalFocusTrap } from "@/components/ui/use-modal-focus-trap";
import { useUnsavedChangesWarning } from "@/components/ui/use-unsaved-changes-warning";
import type { City, Zone } from "@/data/tours";

export type ZoneFormValue = {
  id?: string;
  name: string;
  cities: City[];
};

type ZoneModalProps = {
  zone?: Zone;
  onClose: () => void;
  onSave: (value: ZoneFormValue) => void;
};

const inputClassName = "h-11 w-full rounded-xl border border-[#d9e5e2] bg-animeo-bg px-3.5 text-sm font-semibold text-animeo-dark outline-none transition focus:border-animeo focus:bg-white";
const initialEmptyCity: City = { id: "city-initial", name: "", postalCode: "" };

export function ZoneModal({ zone, onClose, onSave }: ZoneModalProps) {
  const [name, setName] = useState(zone?.name ?? "");
  const [cities, setCities] = useState<City[]>(zone?.cities ?? [initialEmptyCity]);
  const [initialSnapshot] = useState(() => JSON.stringify({ name, cities }));
  const isDirty = JSON.stringify({ name, cities }) !== initialSnapshot;
  const { confirmDiscard } = useUnsavedChangesWarning(isDirty);
  function guardedClose() {
    if (confirmDiscard()) onClose();
  }
  const dialogRef = useModalFocusTrap<HTMLElement>(guardedClose);

  function updateCity(id: string, key: "name" | "postalCode", value: string) {
    setCities((current) => current.map((city) => city.id === id ? { ...city, [key]: value } : city));
  }

  function addCity() {
    setCities((current) => [...current, { id: `city-${Date.now()}-${current.length}`, name: "", postalCode: "" }]);
  }

  function removeCity(id: string) {
    setCities((current) => current.length > 1 ? current.filter((city) => city.id !== id) : current);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave({ id: zone?.id, name: name.trim(), cities: cities.map((city) => ({ ...city, name: city.name.trim(), postalCode: city.postalCode.trim() })) });
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#102f37]/60 p-4 backdrop-blur-sm" role="presentation">
      <section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="zone-dialog-title" className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-[18px] bg-white shadow-[0_24px_70px_rgba(12,39,47,0.3)] outline-none">
        <div className="flex items-start justify-between border-b border-[#e5eeeb] bg-gradient-to-r from-animeo-soft to-white p-5 sm:p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-animeo text-white"><Icon name="map" className="h-6 w-6" /></div>
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-animeo">Villes et codes postaux</p>
              <h2 id="zone-dialog-title" className="mt-1 text-2xl font-black text-animeo-dark">{zone ? "Modifier la zone" : "Créer une zone"}</h2>
              <p className="mt-1 text-sm text-animeo-muted">Aucun rayon ni contour géographique n’est utilisé en V1.</p>
            </div>
          </div>
          <button type="button" onClick={guardedClose} aria-label="Fermer la fenêtre" className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-xl text-animeo-muted shadow-sm">×</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="space-y-5 p-5 sm:p-6">
            <label>
              <span className="mb-2 block text-xs font-extrabold uppercase tracking-[0.11em] text-animeo-muted">Nom de la zone</span>
              <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex. Zone Le Havre" className={inputClassName} required />
            </label>

            <div>
              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs font-extrabold uppercase tracking-[0.11em] text-animeo-muted">Communes</p>
                <span className="rounded-full bg-animeo-soft px-2.5 py-1 text-[10px] font-black text-animeo-dark">{cities.length} ligne{cities.length > 1 ? "s" : ""}</span>
              </div>
              <div className="space-y-2">
                {cities.map((city, index) => (
                  <div key={city.id} className="grid grid-cols-[minmax(0,1fr)_120px_36px] gap-2 rounded-2xl bg-animeo-bg p-2">
                    <label>
                      <span className="sr-only">Ville {index + 1}</span>
                      <input value={city.name} onChange={(event) => updateCity(city.id, "name", event.target.value)} placeholder="Ville" className={inputClassName} required />
                    </label>
                    <label>
                      <span className="sr-only">Code postal {index + 1}</span>
                      <input value={city.postalCode} onChange={(event) => updateCity(city.id, "postalCode", event.target.value)} placeholder="Code postal" inputMode="numeric" className={inputClassName} required />
                    </label>
                    <button type="button" onClick={() => removeCity(city.id)} disabled={cities.length === 1} aria-label={`Supprimer la ligne ${index + 1}`} className="flex h-11 items-center justify-center rounded-xl text-lg font-bold text-animeo-muted transition hover:bg-white hover:text-[#a9573b] disabled:opacity-30">×</button>
                  </div>
                ))}
              </div>
              <button type="button" onClick={addCity} className="mt-3 rounded-xl border border-animeo px-4 py-2.5 text-sm font-extrabold text-animeo transition hover:bg-animeo-soft">+ Ajouter une ville</button>
            </div>
          </div>

          <div className="flex flex-col-reverse gap-2 border-t border-[#e5eeeb] p-5 sm:flex-row sm:justify-end sm:p-6">
            <button type="button" onClick={guardedClose} className="rounded-xl border border-[#d4e2df] px-5 py-2.5 text-sm font-extrabold text-animeo-dark transition hover:bg-animeo-bg">Annuler</button>
            <button type="submit" className="rounded-xl bg-animeo px-5 py-2.5 text-sm font-extrabold text-white transition hover:bg-[#459e90]">{zone ? "Enregistrer" : "Créer la zone"}</button>
          </div>
        </form>
      </section>
    </div>
  );
}
