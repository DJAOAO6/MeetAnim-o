"use client";

import { useEffect, useState } from "react";
import { Field, inputClassName } from "@/components/settings/settings-fields";
import { listPlacesAction } from "@/lib/places-actions";
import { animalPlaceKindLabels, animalPlaceKinds, type AnimalPlaceKind, type AnimalPlaceRef } from "@/data/places";

export type NewPlaceDraft = { name: string; kind: AnimalPlaceKind; address: string; postalCode: string; city: string };

/**
 * « Où vit-il ? » : chez son propriétaire (le cas courant), dans un lieu déjà
 * connu (haras, pension…), ou dans un nouveau lieu décrit ici même.
 */
export type AnimalPlaceChoice =
  | { choice: "home" }
  | { choice: "existing"; placeId: string; place?: AnimalPlaceRef }
  | { choice: "new"; draft: NewPlaceDraft };

export const emptyPlaceDraft: NewPlaceDraft = { name: "", kind: "HARAS", address: "", postalCode: "", city: "" };

export function AnimalPlacePicker({ value, onChange, currentPlace }: {
  value: AnimalPlaceChoice;
  onChange: (value: AnimalPlaceChoice) => void;
  /** Lieu actuel de l'animal : affiché avant même le chargement de la liste. */
  currentPlace?: AnimalPlaceRef | null;
}) {
  const [places, setPlaces] = useState<AnimalPlaceRef[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    void listPlacesAction().then((list) => { if (!cancelled) setPlaces(list); });
    return () => { cancelled = true; };
  }, []);
  const options = places ?? (currentPlace ? [currentPlace] : []);

  function choose(choice: AnimalPlaceChoice["choice"]) {
    if (choice === "home") onChange({ choice: "home" });
    else if (choice === "existing") {
      const placeId = value.choice === "existing" ? value.placeId : currentPlace?.id ?? options[0]?.id ?? "";
      onChange({ choice: "existing", placeId, place: options.find((place) => place.id === placeId) });
    }
    else onChange({ choice: "new", draft: value.choice === "new" ? value.draft : emptyPlaceDraft });
  }
  const draft = value.choice === "new" ? value.draft : null;
  const setDraft = (patch: Partial<NewPlaceDraft>) => draft && onChange({ choice: "new", draft: { ...draft, ...patch } });
  const radio = "flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-animeo-border px-3 text-sm font-bold text-animeo-dark has-[:checked]:border-animeo has-[:checked]:bg-animeo-soft";

  return (
    <fieldset className="space-y-3">
      <legend className="mb-2 text-xs font-medium uppercase tracking-[0.08em] text-animeo-muted">Où vit-il ?</legend>
      <div className="grid gap-2 sm:grid-cols-3">
        <label className={radio}><input type="radio" name="animal-place" checked={value.choice === "home"} onChange={() => choose("home")} />Chez son propriétaire</label>
        <label className={`${radio} ${options.length === 0 ? "cursor-not-allowed opacity-50" : ""}`}>
          <input type="radio" name="animal-place" checked={value.choice === "existing"} disabled={options.length === 0} onChange={() => choose("existing")} />Dans un lieu connu
        </label>
        <label className={radio}><input type="radio" name="animal-place" checked={value.choice === "new"} onChange={() => choose("new")} />Dans un nouveau lieu</label>
      </div>

      {value.choice === "existing" ? (
        <Field label="Lieu">
          <select value={value.placeId} onChange={(event) => onChange({ choice: "existing", placeId: event.target.value, place: options.find((place) => place.id === event.target.value) })} className={inputClassName}>
            {options.map((place) => <option key={place.id} value={place.id}>{place.name} — {place.city}</option>)}
          </select>
        </Field>
      ) : null}

      {draft ? (
        <div className="grid gap-4 rounded-2xl bg-animeo-bg p-4 sm:grid-cols-2">
          <Field label="Nom du lieu"><input value={draft.name} onChange={(event) => setDraft({ name: event.target.value })} className={inputClassName} placeholder="Ex. Haras du Moulin" required /></Field>
          <Field label="Type">
            <select value={draft.kind} onChange={(event) => setDraft({ kind: event.target.value as AnimalPlaceKind })} className={inputClassName}>
              {animalPlaceKinds.map((kind) => <option key={kind} value={kind}>{animalPlaceKindLabels[kind]}</option>)}
            </select>
          </Field>
          <Field label="Adresse"><input value={draft.address} onChange={(event) => setDraft({ address: event.target.value })} className={inputClassName} placeholder="Ex. 12 route de la Forge" /></Field>
          <div className="grid grid-cols-[7rem_1fr] gap-3">
            <Field label="Code postal"><input value={draft.postalCode} onChange={(event) => setDraft({ postalCode: event.target.value })} className={inputClassName} inputMode="numeric" /></Field>
            <Field label="Commune"><input value={draft.city} onChange={(event) => setDraft({ city: event.target.value })} className={inputClassName} required /></Field>
          </div>
          <p className="text-xs text-animeo-muted sm:col-span-2">Le lieu sera localisé sur la carte à partir de son adresse, et proposé pour les autres animaux qui y vivent.</p>
        </div>
      ) : null}
    </fieldset>
  );
}
