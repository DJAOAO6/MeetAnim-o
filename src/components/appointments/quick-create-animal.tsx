"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { createAnimalAction } from "@/lib/clients-actions";
import { AnimalPlacePicker, resolvePlaceChoice, type AnimalPlaceChoice } from "@/components/clients/animal-place-picker";
import { AnimalFields, animalInputFrom, emptyAnimalDraft, focusFirstAnimalError, validateAnimalDraft, withoutChangedErrors, type AnimalDraft } from "@/components/clients/animal-fields";
import type { AnimalFieldErrors } from "@/lib/animal-validation";
import type { ClientPickerAnimal } from "@/data/clients";

const ID_PREFIX = "quick-animal";

/**
 * Création d'un animal sans quitter le rendez-vous, rattaché au client
 * sélectionné, via createAnimalAction — l'action de la fiche client.
 *
 * Les champs sont exactement ceux de la fiche animal (AnimalFields) : un
 * animal ajouté en vitesse n'est pas une fiche au rabais. Seuls le nom,
 * l'espèce et le sexe sont obligatoires ; le reste peut attendre.
 */
export function QuickCreateAnimal({ clientId, clientName, onCreated, onClose }: {
  clientId: string;
  clientName: string;
  onCreated: (animal: ClientPickerAnimal) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<AnimalDraft>(emptyAnimalDraft);
  const [placeChoice, setPlaceChoice] = useState<AnimalPlaceChoice>({ choice: "home" });
  const [errors, setErrors] = useState<AnimalFieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setError(null);
    const fieldErrors = validateAnimalDraft(draft);
    setErrors(fieldErrors);
    if (Object.keys(fieldErrors).length > 0) {
      focusFirstAnimalError(ID_PREFIX, fieldErrors);
      return;
    }
    setPending(true);

    const resolved = await resolvePlaceChoice(placeChoice);
    if (!resolved.ok) { setPending(false); setError(resolved.error); return; }
    setPlaceChoice(resolved.choice);

    const result = await createAnimalAction(clientId, { ...animalInputFrom(draft), placeId: resolved.place?.id ?? null });
    setPending(false);
    if (!result.ok) { setError(result.error); return; }

    onCreated({ id: result.animal.id, name: result.animal.name, species: result.animal.species, breed: result.animal.breed, age: result.animal.age });
  }

  return (
    <Modal
      title="Ajout rapide d’un animal"
      description={`L’animal sera rattaché à la fiche de ${clientName}. Les champs marqués d’un astérisque sont obligatoires.`}
      onClose={onClose}
      size="lg"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" onClick={onClose}>Annuler</Button>
          <Button type="submit" form="quick-create-animal" disabled={pending}>
            {pending ? "Ajout…" : "Ajouter l’animal et continuer"}
          </Button>
        </div>
      }
    >
      <form id="quick-create-animal" onSubmit={submit} noValidate className="space-y-5">
        {error ? <p role="alert" className="rounded-xl bg-animeo-danger-soft px-4 py-3 text-sm font-bold text-animeo-danger">{error}</p> : null}
        <AnimalFields idPrefix={ID_PREFIX} draft={draft} onChange={(patch) => { setDraft((current) => ({ ...current, ...patch })); setErrors((current) => withoutChangedErrors(current, patch)); }} errors={errors} />
        <AnimalPlacePicker value={placeChoice} onChange={setPlaceChoice} />
      </form>
    </Modal>
  );
}
