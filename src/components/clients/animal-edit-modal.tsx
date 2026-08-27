"use client";

import { useState, type FormEvent } from "react";
import { Field, inputClassName, textareaClassName } from "@/components/settings/settings-fields";
import { animalSpeciesList } from "@/data/species";
import { updateAnimalAction, type UpdateAnimalInput } from "@/lib/clients-actions";
import type { Animal } from "@/data/clients";

type AnimalEditModalProps = {
  animal: Animal;
  onClose: () => void;
  onSaved: (animal: Animal) => void;
};

export function AnimalEditModal({ animal, onClose, onSaved }: AnimalEditModalProps) {
  const [draft, setDraft] = useState<UpdateAnimalInput>({
    name: animal.name,
    species: animal.species,
    breed: animal.breed,
    age: animal.age,
    weight: animal.weight,
    sex: animal.sex,
    history: animal.history,
    conditions: animal.conditions,
    treatments: animal.treatments,
    notes: animal.notes,
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function update<K extends keyof UpdateAnimalInput>(key: K, value: UpdateAnimalInput[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaving(true);
    const result = await updateAnimalAction(animal.id, draft);
    setSaving(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    onSaved({ ...animal, ...draft });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#102f37]/60 p-4 backdrop-blur-sm">
      <section role="dialog" aria-modal="true" aria-labelledby="animal-edit-dialog-title" className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-[18px] bg-white shadow-[0_24px_70px_rgba(12,39,47,0.3)]">
        <div className="flex items-start justify-between gap-4 border-b border-[#e5eeeb] p-5 sm:p-6">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-animeo">Fiche animal</p>
            <h2 id="animal-edit-dialog-title" className="mt-1 text-xl font-black text-animeo-dark">Modifier {animal.name}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Fermer" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-animeo-bg text-xl text-animeo-muted">×</button>
        </div>

        <form onSubmit={submit}>
          <div className="space-y-5 p-5 sm:p-6">
            {error ? <p role="alert" className="rounded-xl bg-[#fff1f1] px-4 py-3 text-sm font-bold text-animeo-error">{error}</p> : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nom"><input value={draft.name} onChange={(event) => update("name", event.target.value)} className={inputClassName} required /></Field>
              <Field label="Espèce">
                <select value={draft.species} onChange={(event) => update("species", event.target.value)} className={inputClassName}>
                  {animalSpeciesList.map((species) => <option key={species} value={species}>{species}</option>)}
                  {!animalSpeciesList.includes(draft.species as (typeof animalSpeciesList)[number]) ? <option value={draft.species}>{draft.species}</option> : null}
                </select>
              </Field>
              <Field label="Race"><input value={draft.breed} onChange={(event) => update("breed", event.target.value)} className={inputClassName} /></Field>
              <Field label="Âge"><input value={draft.age} onChange={(event) => update("age", event.target.value)} className={inputClassName} placeholder="Ex. 5 ans" /></Field>
              <Field label="Poids"><input value={draft.weight} onChange={(event) => update("weight", event.target.value)} className={inputClassName} placeholder="Ex. 28 kg" /></Field>
              <Field label="Sexe"><input value={draft.sex} onChange={(event) => update("sex", event.target.value)} className={inputClassName} placeholder="Ex. Mâle, Femelle" /></Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Antécédents"><textarea value={draft.history} onChange={(event) => update("history", event.target.value)} className={textareaClassName} /></Field>
              <Field label="Pathologies / sensibilités"><textarea value={draft.conditions} onChange={(event) => update("conditions", event.target.value)} className={textareaClassName} /></Field>
              <Field label="Traitements"><textarea value={draft.treatments} onChange={(event) => update("treatments", event.target.value)} className={textareaClassName} /></Field>
              <Field label="Notes"><textarea value={draft.notes} onChange={(event) => update("notes", event.target.value)} className={textareaClassName} /></Field>
            </div>
          </div>

          <div className="flex flex-col-reverse gap-2 border-t border-[#e5eeeb] p-5 sm:flex-row sm:justify-end sm:p-6">
            <button type="button" onClick={onClose} className="rounded-xl border border-[#d4e2df] px-5 py-2.5 text-sm font-extrabold text-animeo-dark">Annuler</button>
            <button type="submit" disabled={saving} className="rounded-xl bg-animeo px-6 py-2.5 text-sm font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-60">
              {saving ? "Enregistrement…" : "Enregistrer les modifications"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
