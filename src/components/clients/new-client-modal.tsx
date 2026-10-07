"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useUnsavedChangesWarning } from "@/components/ui/use-unsaved-changes-warning";
import { ClientContactFields } from "@/components/clients/client-edit-modal";
import { AnimalFields, animalInputFrom, emptyAnimalDraft, focusFirstAnimalError, validateAnimalDraft, withoutChangedErrors, type AnimalDraft } from "@/components/clients/animal-fields";
import { createClientWithAnimalsAction, type ClientContactInput } from "@/lib/clients-actions";
import type { AnimalFieldErrors } from "@/lib/animal-validation";
import type { Client } from "@/data/clients";

type AnimalSection = { key: number; draft: AnimalDraft; errors: AnimalFieldErrors };

const emptyContact: ClientContactInput = { firstName: "", lastName: "", phone: "", email: "", city: "", postalCode: "", address: "" };
const prefixOf = (key: number) => `new-animal-${key}`;

/**
 * « Nouveau client » : le propriétaire, puis son premier animal, dans la même
 * fenêtre — et d'autres animaux si besoin. Les champs d'un animal sont ceux
 * de la fiche (AnimalFields).
 *
 * Tout part en une seule action (createClientWithAnimalsAction, en une
 * transaction) : un animal refusé n'enregistre rien, l'erreur revient sur sa
 * section, et on corrige sans risquer de créer deux fois le client.
 *
 * Un propriétaire sans animal reste possible : au téléphone, on ne connaît
 * pas toujours l'animal avant de noter les coordonnées.
 */
export function NewClientModal({ onClose, onCreated }: { onClose: () => void; onCreated: (client: Client) => void }) {
  const [contact, setContact] = useState<ClientContactInput>(emptyContact);
  const [sections, setSections] = useState<AnimalSection[]>([{ key: 0, draft: emptyAnimalDraft, errors: {} }]);
  const [nextKey, setNextKey] = useState(1);
  // Section ajoutée : son nom prend le focus, ce qui l'amène à l'écran.
  const [focusKey, setFocusKey] = useState<number | null>(null);
  useEffect(() => {
    if (focusKey === null) return;
    document.getElementById(`${prefixOf(focusKey)}-name`)?.focus();
  }, [focusKey]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const isDirty = JSON.stringify(contact) !== JSON.stringify(emptyContact) || sections.some((section) => JSON.stringify(section.draft) !== JSON.stringify(emptyAnimalDraft));
  const { confirmDiscard } = useUnsavedChangesWarning(isDirty);

  function guardedClose() {
    if (confirmDiscard()) onClose();
  }

  function updateContact<K extends keyof ClientContactInput>(key: K, value: ClientContactInput[K]) {
    setContact((current) => ({ ...current, [key]: value }));
  }

  function updateSection(key: number, patch: Partial<AnimalDraft>) {
    setSections((current) => current.map((section) => (section.key === key ? { ...section, draft: { ...section.draft, ...patch }, errors: withoutChangedErrors(section.errors, patch) } : section)));
  }

  function addSection() {
    setSections((current) => [...current, { key: nextKey, draft: emptyAnimalDraft, errors: {} }]);
    setFocusKey(nextKey);
    setNextKey((key) => key + 1);
  }

  function removeSection(key: number) {
    setSections((current) => current.filter((section) => section.key !== key));
  }

  async function save(withAnimals: boolean) {
    setError(null);
    if (!contact.firstName.trim() || !contact.lastName.trim()) {
      setError("Le prénom et le nom du propriétaire sont obligatoires.");
      return;
    }
    const kept = withAnimals ? sections : [];
    if (withAnimals) {
      const checked = kept.map((section) => ({ ...section, errors: validateAnimalDraft(section.draft) }));
      setSections(checked);
      const invalid = checked.find((section) => Object.keys(section.errors).length > 0);
      if (invalid) {
        focusFirstAnimalError(prefixOf(invalid.key), invalid.errors);
        return;
      }
    }

    setSaving(true);
    const result = await createClientWithAnimalsAction({ client: contact, animals: kept.map((section) => animalInputFrom(section.draft)) });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      if (result.animalErrors) {
        setSections((current) => current.map((section, index) => ({ ...section, errors: result.animalErrors?.[index] ?? {} })));
      }
      return;
    }
    onCreated(result.client);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void save(sections.length > 0);
  }

  return (
    <Modal
      onSubmit={submit}
      title="Nouveau client"
      description="Le propriétaire, puis son animal — les champs marqués d’un astérisque sont obligatoires."
      onClose={guardedClose}
      size="lg"
      footer={
        <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:items-center">
          {sections.length > 0 ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => void save(false)} disabled={saving} className="sm:mr-auto">
              Enregistrer sans animal
            </Button>
          ) : <span className="sm:mr-auto" />}
          <Button type="button" variant="secondary" onClick={guardedClose}>Annuler</Button>
          <Button type="submit" disabled={saving}>{saving ? "Enregistrement…" : "Créer le client"}</Button>
        </div>
      }
    >
      <div className="space-y-6">
        {error ? <p role="alert" className="rounded-xl bg-animeo-danger-soft px-4 py-3 text-sm font-bold text-animeo-danger">{error}</p> : null}

        <section aria-labelledby="new-client-owner">
          <h3 id="new-client-owner" className="mb-3 text-base font-black text-animeo-dark">Propriétaire</h3>
          <ClientContactFields draft={contact} onChange={updateContact} />
        </section>

        {sections.map((section, index) => (
          <section key={section.key} aria-labelledby={`${prefixOf(section.key)}-title`} className="rounded-2xl border border-animeo-border-soft p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 id={`${prefixOf(section.key)}-title`} className="text-base font-black text-animeo-dark">{index === 0 ? "Premier animal" : `Animal ${index + 1}`}</h3>
              <button type="button" onClick={() => removeSection(section.key)} className="min-h-9 rounded-lg px-3 text-xs font-extrabold text-animeo-muted hover:bg-animeo-bg" aria-label={`Retirer ${index === 0 ? "le premier animal" : `l’animal ${index + 1}`}`}>
                Retirer
              </button>
            </div>
            <AnimalFields idPrefix={prefixOf(section.key)} draft={section.draft} onChange={(patch) => updateSection(section.key, patch)} errors={section.errors} />
          </section>
        ))}

        <Button type="button" variant="secondary" onClick={addSection} className="w-full sm:w-auto">
          <Plus aria-hidden="true" className="h-4 w-4" />
          {sections.length === 0 ? "Ajouter un animal" : "Ajouter un autre animal"}
        </Button>
      </div>
    </Modal>
  );
}
