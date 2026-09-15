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
  const { confirmDiscard } = useUnsavedChangesWarning(isDirty);
  function guardedClose() {
    if (confirmDiscard()) onClose();
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

  // Formulaire autour de la modale : le bouton d'envoi vit dans la barre
  // d'actions fixe, hors du flux du contenu, et doit rester dans le <form>.
  return (
    <form onSubmit={submit}>
      <Modal
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
            {error ? <p role="alert" className="rounded-xl bg-animeo-danger-soft px-4 py-3 text-sm font-bold text-animeo-error">{error}</p> : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Prénom"><input value={draft.firstName} onChange={(event) => update("firstName", event.target.value)} className={inputClassName} required /></Field>
              <Field label="Nom"><input value={draft.lastName} onChange={(event) => update("lastName", event.target.value)} className={inputClassName} required /></Field>
              <Field label="Téléphone"><input value={draft.phone} onChange={(event) => update("phone", event.target.value)} className={inputClassName} placeholder="06 12 34 56 78" /></Field>
              <Field label="Email"><input type="email" value={draft.email} onChange={(event) => update("email", event.target.value)} className={inputClassName} placeholder="vous@exemple.fr" /></Field>
              <Field label="Code postal"><input value={draft.postalCode} onChange={(event) => update("postalCode", event.target.value)} className={inputClassName} /></Field>
              <Field label="Ville"><input value={draft.city} onChange={(event) => update("city", event.target.value)} className={inputClassName} /></Field>
              <Field label="Adresse"><input value={draft.address} onChange={(event) => update("address", event.target.value)} className={inputClassName} /></Field>
            </div>
        </div>
      </Modal>
    </form>
  );
}
