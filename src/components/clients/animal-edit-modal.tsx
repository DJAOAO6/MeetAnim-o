"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useUnsavedChangesWarning } from "@/components/ui/use-unsaved-changes-warning";
import { createAnimalAction, updateAnimalAction } from "@/lib/clients-actions";
import { AnimalPlacePicker, resolvePlaceChoice, type AnimalPlaceChoice } from "@/components/clients/animal-place-picker";
import { AnimalFields, animalInputFrom, emptyAnimalDraft, focusFirstAnimalError, validateAnimalDraft, withoutChangedErrors, type AnimalDraft } from "@/components/clients/animal-fields";
import type { AnimalFieldErrors } from "@/lib/animal-validation";
import type { Animal } from "@/data/clients";

const ID_PREFIX = "animal-form";

type AnimalEditModalProps = {
  /** Absent = création d'un nouvel animal (nécessite alors clientId). */
  animal?: Animal;
  clientId?: string;
  onClose: () => void;
  onSaved: (animal: Animal) => void;
};

/** Fiche animal : ajout et modification, avec les champs partagés (AnimalFields). */
export function AnimalEditModal({ animal, clientId, onClose, onSaved }: AnimalEditModalProps) {
  const [draft, setDraft] = useState<AnimalDraft>(animal ? {
    name: animal.name,
    species: animal.species,
    breed: animal.breed,
    sex: animal.sex,
    birthDate: animal.birthDate ?? "",
    birthDateApproximate: animal.birthDateApproximate,
    age: animal.ageText,
    weight: animal.weight,
    history: animal.history,
    conditions: animal.conditions,
    treatments: animal.treatments,
    notes: animal.notes,
  } : emptyAnimalDraft);
  const [placeChoice, setPlaceChoice] = useState<AnimalPlaceChoice>(animal?.place ? { choice: "existing", placeId: animal.place.id, place: animal.place } : { choice: "home" });
  const [errors, setErrors] = useState<AnimalFieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [initialSnapshot] = useState(() => JSON.stringify({ draft, placeChoice }));
  const isDirty = JSON.stringify({ draft, placeChoice }) !== initialSnapshot;
  const { confirmDiscard } = useUnsavedChangesWarning(isDirty);
  const previous = animal ? { species: animal.species, sex: animal.sex } : undefined;

  function guardedClose() {
    if (confirmDiscard()) onClose();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const fieldErrors = validateAnimalDraft(draft, previous);
    setErrors(fieldErrors);
    if (Object.keys(fieldErrors).length > 0) {
      focusFirstAnimalError(ID_PREFIX, fieldErrors);
      return;
    }
    setSaving(true);

    const resolved = await resolvePlaceChoice(placeChoice, animal?.place);
    if (!resolved.ok) { setSaving(false); setError(resolved.error); return; }
    setPlaceChoice(resolved.choice);
    const input = { ...animalInputFrom(draft), placeId: resolved.place?.id ?? null };

    const result = animal ? await updateAnimalAction(animal.id, input) : await createAnimalAction(clientId!, input);
    setSaving(false);
    if (!result.ok) { setError(result.error); return; }
    // L'animal tel qu'enregistré : pictogramme et âge à jour.
    onSaved(result.animal);
  }

  // onSubmit : la fenêtre rend elle-même le <form> autour du contenu et de
  // la barre d'actions, où vit le bouton d'envoi — dans le portail.
  return (
    <Modal
      onSubmit={submit}
      title={animal ? `Modifier ${animal.name}` : "Ajouter un animal"}
      description="Fiche animal — les champs marqués d’un astérisque sont obligatoires."
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
        <AnimalFields idPrefix={ID_PREFIX} draft={draft} onChange={(patch) => { setDraft((current) => ({ ...current, ...patch })); setErrors((current) => withoutChangedErrors(current, patch)); }} errors={errors} previousSex={animal?.sex} />
        <AnimalPlacePicker value={placeChoice} onChange={setPlaceChoice} currentPlace={animal?.place} />
      </div>
    </Modal>
  );
}
