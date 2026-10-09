"use client";

import { useState, type FormEvent } from "react";
import { Field, inputClassName } from "@/components/settings/settings-fields";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useUnsavedChangesWarning } from "@/components/ui/use-unsaved-changes-warning";
import type { Client } from "@/data/clients";
import type { ClientContactInput } from "@/lib/clients-actions";

type ClientEditModalProps = {
  client?: Client;
  onClose: () => void;
  onSave: (input: ClientContactInput) => Promise<void>;
  saving: boolean;
};

export function ClientEditModal({ client, onClose, onSave, saving }: ClientEditModalProps) {
  const [draft, setDraft] = useState<ClientContactInput>({
    firstName: client?.firstName ?? "",
    lastName: client?.lastName ?? "",
    phone: client?.phone ?? "",
    email: client?.email ?? "",
    city: client?.city ?? "",
    postalCode: client?.postalCode ?? "",
    address: client?.address ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [initialSnapshot] = useState(() => JSON.stringify(draft));
  const isDirty = JSON.stringify(draft) !== initialSnapshot;
  const { guard } = useUnsavedChangesWarning(isDirty);
  function guardedClose() {
    guard(onClose);
  }

  function update<K extends keyof ClientContactInput>(key: K, value: ClientContactInput[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!draft.firstName.trim() || !draft.lastName.trim()) {
      setError("Le prénom et le nom sont obligatoires.");
      return;
    }
    await onSave(draft);
  }

  // onSubmit : la fenêtre rend elle-même le <form> autour du contenu et de
  // la barre d'actions, où vit le bouton d'envoi — dans le portail.
  return (
    <Modal
      onSubmit={submit}
      title={client ? `Modifier ${client.firstName} ${client.lastName}` : "Nouveau client"}
      description="Fiche client"
      onClose={guardedClose}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={guardedClose}>Annuler</Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Enregistrement…" : client ? "Enregistrer les modifications" : "Créer le client"}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
          {error ? <p role="alert" className="rounded-xl bg-animeo-danger-soft px-4 py-3 text-sm font-bold text-animeo-danger">{error}</p> : null}

          <ClientContactFields draft={draft} onChange={update} />
      </div>
    </Modal>
  );
}

/** Les coordonnées d'un propriétaire : fiche client, et nouveau client avec ses animaux. */
export function ClientContactFields({ draft, onChange }: {
  draft: ClientContactInput;
  onChange: <K extends keyof ClientContactInput>(key: K, value: ClientContactInput[K]) => void;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Prénom"><input value={draft.firstName} onChange={(event) => onChange("firstName", event.target.value)} className={inputClassName} required /></Field>
      <Field label="Nom"><input value={draft.lastName} onChange={(event) => onChange("lastName", event.target.value)} className={inputClassName} required /></Field>
      <Field label="Téléphone"><input value={draft.phone} onChange={(event) => onChange("phone", event.target.value)} className={inputClassName} placeholder="06 12 34 56 78" /></Field>
      <Field label="Email"><input type="email" value={draft.email} onChange={(event) => onChange("email", event.target.value)} className={inputClassName} placeholder="vous@exemple.fr" /></Field>
      <Field label="Code postal"><input value={draft.postalCode} onChange={(event) => onChange("postalCode", event.target.value)} className={inputClassName} /></Field>
      <Field label="Ville"><input value={draft.city} onChange={(event) => onChange("city", event.target.value)} className={inputClassName} /></Field>
      <Field label="Adresse"><input value={draft.address} onChange={(event) => onChange("address", event.target.value)} className={inputClassName} /></Field>
    </div>
  );
}
