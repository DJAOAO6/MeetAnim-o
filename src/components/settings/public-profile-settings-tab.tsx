"use client";

import { useState, type FormEvent } from "react";
import { Card } from "@/components/ui/card";
import { Field, ImagePicker, SectionTitle, Toggle, inputClassName, textareaClassName } from "@/components/settings/settings-fields";
import type { ProfileSettings } from "@/data/settings";

type PublicProfileSettingsTabProps = {
  value: ProfileSettings;
  saving?: boolean;
  canEdit?: boolean;
  onSave: (value: ProfileSettings) => void;
};

export function PublicProfileSettingsTab({ value, saving = false, canEdit = true, onSave }: PublicProfileSettingsTabProps) {
  const [draft, setDraft] = useState(value);

  function update<K extends keyof ProfileSettings>(key: K, next: ProfileSettings[K]) {
    setDraft((current) => ({ ...current, [key]: next }));
  }

  function updateText<K extends keyof ProfileSettings>(key: K, next: string) {
    update(key, (next.trim() ? next : null) as ProfileSettings[K]);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave(draft);
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      {!canEdit ? (
        <div role="status" className="rounded-2xl border border-[#f0d8a5] bg-[#fffaf0] px-4 py-3 text-sm font-bold text-[#8c6118]">Vous n’avez pas la permission de modifier les paramètres publics. Contactez un administrateur.</div>
      ) : null}
      <fieldset disabled={!canEdit} className="space-y-6 disabled:opacity-60">
        <Card className="p-5 sm:p-6">
          <SectionTitle title="Profil public" description="Ce qui apparaît en haut de votre page de réservation — en plus de votre photo, nom et bio déjà réglés dans « Mon profil »." />
          <div className="mb-6">
            <ImagePicker label="Photo de couverture" value={draft.coverPicture ?? ""} onChange={(next) => update("coverPicture", next || null)} />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <Field label="Phrase d’accroche" hint="Très courte, affichée juste sous votre nom (ex. « Ostéopathe animalier diplômée et certifiée »).">
                <input value={draft.tagline ?? ""} onChange={(event) => updateText("tagline", event.target.value)} className={inputClassName} maxLength={140} />
              </Field>
            </div>
            <div className="md:col-span-2">
              <Field label="Nom du cabinet" hint="Distinct du nom de l’entreprise si besoin, ex. « Centre Rivada ».">
                <input value={draft.cabinetName ?? ""} onChange={(event) => updateText("cabinetName", event.target.value)} className={inputClassName} />
              </Field>
            </div>
            <Field label="N° d’agrément / certification"><input value={draft.registrationNumber ?? ""} onChange={(event) => updateText("registrationNumber", event.target.value)} className={inputClassName} placeholder="Ex. OA1951" /></Field>
            <Field label="Moyens de paiement acceptés"><input value={draft.acceptedPayments ?? ""} onChange={(event) => updateText("acceptedPayments", event.target.value)} className={inputClassName} placeholder="Ex. Chèque, espèces ou virement" /></Field>
          </div>
        </Card>

        <Card className="p-5 sm:p-6">
          <SectionTitle title="Réseaux et liens" />
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Site internet"><input type="url" value={draft.website ?? ""} onChange={(event) => updateText("website", event.target.value)} className={inputClassName} placeholder="https://…" /></Field>
            <Field label="Facebook"><input type="url" value={draft.facebook ?? ""} onChange={(event) => updateText("facebook", event.target.value)} className={inputClassName} placeholder="https://facebook.com/…" /></Field>
            <Field label="Instagram"><input type="url" value={draft.instagram ?? ""} onChange={(event) => updateText("instagram", event.target.value)} className={inputClassName} placeholder="https://instagram.com/…" /></Field>
          </div>
        </Card>

        <Card className="p-5 sm:p-6">
          <SectionTitle title="Informations pratiques du cabinet" description="Affichées sous l’adresse, uniquement si renseignées." />
          <div className="grid gap-4">
            <Field label="Instructions d’accès"><textarea value={draft.cabinetInstructions ?? ""} onChange={(event) => updateText("cabinetInstructions", event.target.value)} className={textareaClassName} placeholder="Ex. 2e étage, interphone au nom de…" /></Field>
            <Field label="Stationnement"><textarea value={draft.parkingInformation ?? ""} onChange={(event) => updateText("parkingInformation", event.target.value)} className={textareaClassName} placeholder="Ex. Parking gratuit devant le cabinet" /></Field>
            <Field label="Accessibilité"><textarea value={draft.accessibilityInformation ?? ""} onChange={(event) => updateText("accessibilityInformation", event.target.value)} className={textareaClassName} placeholder="Ex. Accès de plain-pied, PMR" /></Field>
          </div>
        </Card>

        <Card className="p-5 sm:p-6">
          <SectionTitle title="Ce qui est visible publiquement" description="Une information reste masquée si elle n’est pas renseignée, même si l’affichage est activé ici." />
          <div className="flex flex-wrap gap-3">
            <Toggle checked={draft.showPhonePublicly} onChange={(checked) => update("showPhonePublicly", checked)} label="Afficher mon téléphone" />
            <Toggle checked={draft.showAddressPublicly} onChange={(checked) => update("showAddressPublicly", checked)} label="Afficher mon adresse" />
            <Toggle checked={draft.showHoursPublicly} onChange={(checked) => update("showHoursPublicly", checked)} label="Afficher mes horaires" />
            <Toggle checked={draft.showSocialsPublicly} onChange={(checked) => update("showSocialsPublicly", checked)} label="Afficher mes réseaux" />
            <Toggle checked={draft.showPaymentsPublicly} onChange={(checked) => update("showPaymentsPublicly", checked)} label="Afficher mes moyens de paiement" />
          </div>
        </Card>

        <div className="flex justify-end">
          <button type="submit" disabled={saving} className="rounded-2xl bg-animeo px-6 py-3 text-sm font-extrabold text-white shadow-[0_8px_20px_rgba(79,175,159,0.2)] transition hover:bg-[#459e90] disabled:cursor-not-allowed disabled:opacity-60">{saving ? "Enregistrement…" : "Enregistrer les modifications"}</button>
        </div>
      </fieldset>
    </form>
  );
}
