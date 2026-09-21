"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useUnsavedChangesWarning } from "@/components/ui/use-unsaved-changes-warning";
import { UnifiedSearch, type UnifiedSearchSelection } from "@/components/search/unified-search";
import type { City, Zone, ZoneSector } from "@/data/tours";

export type ZoneFormValue = {
  id?: string;
  name: string;
  cities: City[];
  sector: ZoneSector | null;
};

type ZoneModalProps = {
  zone?: Zone;
  /** Nom déjà tapé ailleurs (création depuis le formulaire de tournée). */
  defaultName?: string;
  onClose: () => void;
  onSave: (value: ZoneFormValue) => void;
};

const inputClassName = "h-11 w-full rounded-xl border border-animeo-border bg-animeo-bg px-3.5 text-sm text-animeo-dark outline-none transition focus:border-animeo focus:bg-white";
const initialEmptyCity: City = { id: "city-initial", name: "", postalCode: "" };
/** Paliers de rayon, comme sur la carte des clients — mêmes repères. */
const RADIUS_TIERS = [5, 10, 15, 20, 30, 50];
const DEFAULT_RADIUS_KM = 20;

export function ZoneModal({ zone, defaultName, onClose, onSave }: ZoneModalProps) {
  const [name, setName] = useState(zone?.name ?? defaultName ?? "");
  const [cities, setCities] = useState<City[]>(zone?.cities ?? [initialEmptyCity]);
  const [sector, setSector] = useState<ZoneSector | null>(zone?.sector ?? null);
  const [initialSnapshot] = useState(() => JSON.stringify({ name, cities, sector }));
  const isDirty = JSON.stringify({ name, cities, sector }) !== initialSnapshot;
  const { confirmDiscard } = useUnsavedChangesWarning(isDirty);
  function guardedClose() {
    if (confirmDiscard()) onClose();
  }

  function updateCity(id: string, key: "name" | "postalCode", value: string) {
    setCities((current) => current.map((city) => city.id === id ? { ...city, [key]: value } : city));
  }

  // Phase 3 quater (recherche unifiée) : sélectionner une commune renseigne
  // la ville ET son code postal (déjà connu de l'API) — sans empêcher une
  // correction manuelle ensuite si la commune a plusieurs codes postaux.
  function handleCitySearchSelect(id: string, selection: UnifiedSearchSelection) {
    if (selection.kind !== "place" || selection.place.type !== "commune") return;
    setCities((current) => current.map((city) => city.id === id ? { ...city, name: selection.place.label, postalCode: selection.place.postalCode ?? city.postalCode } : city));
  }

  function addCity() {
    setCities((current) => [...current, { id: `city-${Date.now()}-${current.length}`, name: "", postalCode: "" }]);
  }

  function removeCity(id: string) {
    setCities((current) => current.length > 1 ? current.filter((city) => city.id !== id) : current);
  }

  function handleSectorSelect(selection: UnifiedSearchSelection) {
    if (selection.kind !== "place") return;
    setSector((current) => ({
      label: selection.place.label,
      lat: selection.place.lat,
      lng: selection.place.lng,
      radiusKm: current?.radiusKm ?? DEFAULT_RADIUS_KM,
    }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave({
      id: zone?.id,
      name: name.trim(),
      cities: cities.map((city) => ({ ...city, name: city.name.trim(), postalCode: city.postalCode.trim() })),
      sector,
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <Modal
        title={zone ? "Modifier la zone" : "Créer une zone"}
        description="Décrivez la zone par un secteur (un lieu et un rayon), par la liste de ses communes, ou par les deux."
        onClose={guardedClose}
        size="lg"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={guardedClose}>Annuler</Button>
            <Button type="submit">{zone ? "Enregistrer" : "Créer la zone"}</Button>
          </>
        }
      >
          <div className="space-y-5 p-5 sm:p-6">
            <label>
              <span className="mb-2 block text-xs font-medium uppercase tracking-[0.11em] text-animeo-muted">Nom de la zone</span>
              <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex. Zone Le Havre" className={inputClassName} required />
            </label>

            <div className="rounded-2xl border border-animeo-border-soft bg-animeo-bg p-4">
              <p className="text-xs font-medium uppercase tracking-[0.11em] text-animeo-muted">Secteur d’intervention</p>
              <p className="mt-1 text-xs text-animeo-muted">
                Un lieu et un rayon autour de lui. Tout rendez-vous à domicile situé dedans appartient à cette zone, même
                dans une commune que vous n’avez pas listée.
              </p>

              <div className="mt-3">
                <span className="sr-only">Lieu au centre du secteur</span>
                <UnifiedSearch
                  sources={["place"]}
                  placeholder="Rechercher un lieu (ex. Rouen)"
                  defaultValue={sector?.label ?? ""}
                  onSelect={handleSectorSelect}
                  // Un secteur a besoin de vraies coordonnées : taper un nom
                  // sans le choisir dans la liste ne peut rien centrer.
                  onSubmitFreeText={() => {}}
                />
              </div>

              {sector ? (
                <div className="mt-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-bold text-animeo-dark">
                      {sector.radiusKm} km autour de {sector.label}
                    </p>
                    <button type="button" onClick={() => setSector(null)} className="text-xs font-medium text-animeo-danger hover:underline">
                      Retirer le secteur
                    </button>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {RADIUS_TIERS.map((km) => (
                      <button
                        key={km}
                        type="button"
                        onClick={() => setSector((current) => (current ? { ...current, radiusKm: km } : current))}
                        aria-pressed={sector.radiusKm === km}
                        className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${sector.radiusKm === km ? "border-animeo bg-animeo-soft text-animeo-dark" : "border-transparent bg-white text-animeo-muted hover:text-animeo-dark"}`}
                      >
                        {km} km
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <div>
              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs font-medium uppercase tracking-[0.11em] text-animeo-muted">Communes</p>
                <span className="rounded-full bg-animeo-soft px-2.5 py-1 text-[10px] font-medium text-animeo-dark">{cities.length} ligne{cities.length > 1 ? "s" : ""}</span>
              </div>
              <div className="space-y-2">
                {cities.map((city, index) => (
                  <div key={city.id} className="grid grid-cols-[minmax(0,1fr)_120px_36px] gap-2 rounded-2xl bg-animeo-bg p-2">
                    <div>
                      <span className="sr-only">Ville {index + 1}</span>
                      <UnifiedSearch
                        sources={["place"]}
                        placeTypes={["commune"]}
                        placeholder="Rechercher une ville"
                        defaultValue={city.name}
                        onSelect={(selection) => handleCitySearchSelect(city.id, selection)}
                        onSubmitFreeText={(text) => updateCity(city.id, "name", text)}
                        commitOnBlur
                      />
                    </div>
                    <label>
                      <span className="sr-only">Code postal {index + 1}</span>
                      <input value={city.postalCode} onChange={(event) => updateCity(city.id, "postalCode", event.target.value)} placeholder="Code postal" inputMode="numeric" className={inputClassName} required />
                    </label>
                    <button type="button" onClick={() => removeCity(city.id)} disabled={cities.length === 1} aria-label={`Supprimer la ligne ${index + 1}`} className="flex h-11 items-center justify-center rounded-xl text-lg font-medium text-animeo-muted transition hover:bg-white hover:text-animeo-danger disabled:opacity-30">×</button>
                  </div>
                ))}
              </div>
              <button type="button" onClick={addCity} className="mt-3 rounded-xl border border-animeo px-4 py-2.5 text-sm font-medium text-animeo transition hover:bg-animeo-soft">+ Ajouter une ville</button>
            </div>
          </div>

      </Modal>
    </form>
  );
}
