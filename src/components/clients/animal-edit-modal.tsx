"use client";

import { useState, type FormEvent } from "react";
import { Field, inputClassName, textareaClassName } from "@/components/settings/settings-fields";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useUnsavedChangesWarning } from "@/components/ui/use-unsaved-changes-warning";
import { animalSpeciesList } from "@/data/species";
import { createAnimalAction, updateAnimalAction, type UpdateAnimalInput } from "@/lib/clients-actions";
import type { Animal } from "@/data/clients";

const emptyDraft: UpdateAnimalInput = {
  name: "",
  species: "Chien",
  breed: "",
  age: "",
  weight: "",
  sex: "",
  history: "",
  conditions: "",
  treatments: "",
  notes: "",
};

type AnimalEditModalProps = {
  /** Absent = création d'un nouvel animal (nécessite alors clientId). */
  animal?: Animal;
  clientId?: string;
  onClose: () => void;
  onSaved: (animal: Animal) => void;
};

export function AnimalEditModal({ animal, clientId, onClose, onSaved }: AnimalEditModalProps) {
  const [draft, setDraft] = useState<UpdateAnimalInput>(animal ? {
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
  } : emptyDraft);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [initialSnapshot] = useState(() => JSON.stringify(draft));
  const isDirty = JSON.stringify(draft) !== initialSnapshot;
  const { confirmDiscard } = useUnsavedChangesWarning(isDirty);
  function guardedClose() {
    if (confirmDiscard()) onClose();
  }

  function update<K extends keyof UpdateAnimalInput>(key: K, value: UpdateAnimalInput[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaving(true);

    if (animal) {
      const result = await updateAnimalAction(animal.id, draft);
      setSaving(false);
      if (!result.ok) { setError(result.error); return; }
      onSaved({ ...animal, ...draft });
      return;
    }

    const result = await createAnimalAction(clientId!, draft);
    setSaving(false);
    if (!result.ok) { setError(result.error); return; }
    onSaved(result.animal);
  }

  // Le formulaire enveloppe la modale plutôt que l'inverse : le bouton
  // d'envoi vit dans la barre d'actions fixe, hors du flux du contenu, et
  // doit rester rattaché au même <form> pour que submit fonctionne.
  return (
    <form onSubmit={submit}>
      <Modal
        title={animal ? `Modifier ${animal.name}` : "Ajouter un animal"}
        description="Fiche animal"
        onClose={guardedClose}
        size="lg"
        footer={
          <>
          <Button type="button" variant="secondary" onClick={guardedClose}>Annuler</Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Enregistrement…" : animal ? "Enregistrer les modifications" : "Ajouter l’animal"}
          </Button>
          </>
        }
      >
        <div className="space-y-5">
          {error ? <p role="alert" className="rounded-xl bg-animeo-danger-soft px-4 py-3 text-sm font-bold text-animeo-error">{error}</p> : null}

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
      </Modal>
    </form>
  );
}
