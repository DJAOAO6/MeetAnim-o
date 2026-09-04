"use client";

import { useState, type FormEvent } from "react";
import { Field, inputClassName } from "@/components/settings/settings-fields";
import { useModalFocusTrap } from "@/components/ui/use-modal-focus-trap";
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
  const dialogRef = useModalFocusTrap<HTMLElement>(guardedClose);

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#102f37]/60 p-4 backdrop-blur-sm">
      <section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="client-edit-dialog-title" className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-[18px] bg-white shadow-[0_24px_70px_rgba(12,39,47,0.3)] outline-none">
        <div className="flex items-start justify-between gap-4 border-b border-[#e5eeeb] p-5 sm:p-6">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-animeo">Fiche client</p>
            <h2 id="client-edit-dialog-title" className="mt-1 text-xl font-black text-animeo-dark">{client ? `Modifier ${client.firstName} ${client.lastName}` : "Nouveau client"}</h2>
          </div>
          <button type="button" onClick={guardedClose} aria-label="Fermer" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-animeo-bg text-xl text-animeo-muted">×</button>
        </div>

        <form onSubmit={submit}>
          <div className="space-y-5 p-5 sm:p-6">
            {error ? <p role="alert" className="rounded-xl bg-[#fff1f1] px-4 py-3 text-sm font-bold text-animeo-error">{error}</p> : null}

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

          <div className="flex flex-col-reverse gap-2 border-t border-[#e5eeeb] p-5 sm:flex-row sm:justify-end sm:p-6">
            <button type="button" onClick={guardedClose} className="rounded-xl border border-[#d4e2df] px-5 py-2.5 text-sm font-extrabold text-animeo-dark">Annuler</button>
            <button type="submit" disabled={saving} className="rounded-xl bg-animeo px-6 py-2.5 text-sm font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-60">
              {saving ? "Enregistrement…" : client ? "Enregistrer les modifications" : "Créer le client"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
