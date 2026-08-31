"use client";

import { useState, type FormEvent } from "react";
import { Card } from "@/components/ui/card";
import { AddressAutocomplete } from "@/components/ui/address-autocomplete";
import { Field, ImagePicker, SectionTitle, inputClassName, textareaClassName } from "@/components/settings/settings-fields";
import type { GeocodedAddress } from "@/data/geocoding";
import type { ProfileSettings } from "@/data/settings";

type ProfileSettingsTabProps = {
  value: ProfileSettings;
  saving?: boolean;
  canEdit?: boolean;
  onSave: (value: ProfileSettings) => void;
};

function cleanSlug(value: string) {
  return value.toLocaleLowerCase("fr-FR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

// L'ancien préfixe "animeo.fr/" (jamais un domaine réel) et l'absence du
// segment "/reserver/" produisaient un lien copié qui ne menait nulle part.
// Dérivé de NEXT_PUBLIC_APP_URL — inliné au build, comme dans reminder-modal.tsx.
const appOrigin = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/^https?:\/\//, "");

export function ProfileSettingsTab({ value, saving = false, canEdit = true, onSave }: ProfileSettingsTabProps) {
  const [draft, setDraft] = useState(value);
  const [copied, setCopied] = useState(false);
  const publicLinkPrefix = `${appOrigin}/reserver/`;
  const publicLink = `${publicLinkPrefix}${draft.slug || "votre-nom"}`;

  function update<K extends keyof ProfileSettings>(key: K, next: ProfileSettings[K]) {
    setDraft((current) => ({ ...current, [key]: next }));
  }

  function applySelectedAddress(result: GeocodedAddress) {
    setDraft((current) => ({ ...current, address: result.label, postalCode: result.postcode, city: result.city }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave(draft);
  }

  async function copyLink() {
    await navigator.clipboard.writeText(`https://${publicLink}`);
    setCopied(true);
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      {!canEdit ? (
        <div role="status" className="rounded-2xl border border-[#f0d8a5] bg-[#fffaf0] px-4 py-3 text-sm font-bold text-[#8c6118]">Vous n’avez pas la permission de modifier les paramètres publics. Contactez un administrateur.</div>
      ) : null}
      <fieldset disabled={!canEdit} className="space-y-6 disabled:opacity-60">
      <Card className="p-5 sm:p-6">
        <SectionTitle title="Mon profil" description="Ces informations seront utilisées sur votre espace professionnel et votre page publique." />
        <div className="mb-6 grid gap-4 md:grid-cols-2">
          <ImagePicker label="Photo du professionnel" value={draft.photo} onChange={(next) => update("photo", next)} />
          <ImagePicker label="Logo de l’entreprise" value={draft.logo} onChange={(next) => update("logo", next)} shape="square" />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Prénom"><input value={draft.firstName} onChange={(event) => update("firstName", event.target.value)} className={inputClassName} required /></Field>
          <Field label="Nom"><input value={draft.lastName} onChange={(event) => update("lastName", event.target.value)} className={inputClassName} required /></Field>
          <Field label="Profession"><input value={draft.profession} onChange={(event) => update("profession", event.target.value)} className={inputClassName} /></Field>
          <Field label="Nom de l’entreprise"><input value={draft.company} onChange={(event) => update("company", event.target.value)} className={inputClassName} /></Field>
          <Field label="Téléphone"><input type="tel" value={draft.phone} onChange={(event) => update("phone", event.target.value)} className={inputClassName} /></Field>
          <Field label="Email"><input type="email" value={draft.email} onChange={(event) => update("email", event.target.value)} className={inputClassName} /></Field>
          <div className="md:col-span-2">
            <Field label="Adresse du cabinet">
              <AddressAutocomplete value={draft.address} onQueryChange={(value) => update("address", value)} onSelect={applySelectedAddress} inputClassName={inputClassName} />
            </Field>
          </div>
          <Field label="Code postal"><input value={draft.postalCode} onChange={(event) => update("postalCode", event.target.value)} className={inputClassName} inputMode="numeric" /></Field>
          <Field label="Ville"><input value={draft.city} onChange={(event) => update("city", event.target.value)} className={inputClassName} /></Field>
          <div className="md:col-span-2"><Field label="Zone d’intervention" hint="Affichée sur votre page publique, ex. « Rouen et Normandie »."><input value={draft.location} onChange={(event) => update("location", event.target.value)} className={inputClassName} /></Field></div>
          <div className="md:col-span-2"><Field label="Bio courte"><textarea value={draft.bio} onChange={(event) => update("bio", event.target.value)} className={textareaClassName} /></Field></div>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="bg-gradient-to-r from-animeo-soft to-white p-5 sm:p-6">
          <SectionTitle title="Votre lien de réservation" description="Partagez ce lien avec vos clients pour recevoir leurs demandes de rendez-vous." />
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
            <Field label="Slug public" hint="Lettres minuscules, chiffres et tirets uniquement.">
              <div className="flex overflow-hidden rounded-xl border border-[#d9e5e2] bg-white focus-within:border-animeo">
                <span className="flex items-center border-r border-[#e2eae8] bg-animeo-bg px-3 text-sm font-bold text-animeo-muted">{publicLinkPrefix}</span>
                <input value={draft.slug} onChange={(event) => update("slug", cleanSlug(event.target.value))} className="h-11 min-w-0 flex-1 px-3 text-sm font-bold text-animeo-dark outline-none" required />
              </div>
            </Field>
            <button type="button" onClick={copyLink} className="self-end rounded-xl border border-animeo px-5 py-3 text-sm font-extrabold text-animeo transition hover:bg-white">{copied ? "Lien copié ✓" : "Copier le lien"}</button>
          </div>
          <div className="mt-5 rounded-2xl bg-white p-4 shadow-sm">
            <p className="text-xs font-extrabold uppercase tracking-[0.11em] text-animeo-muted">Aperçu du lien public</p>
            <p className="mt-2 break-all text-base font-black text-animeo">https://{publicLink}</p>
          </div>
        </div>
      </Card>

      <div className="flex justify-end">
        <button type="submit" disabled={saving} className="rounded-2xl bg-animeo px-6 py-3 text-sm font-extrabold text-white shadow-[0_8px_20px_rgba(79,175,159,0.2)] transition hover:bg-[#459e90] disabled:cursor-not-allowed disabled:opacity-60">{saving ? "Enregistrement…" : "Enregistrer les modifications"}</button>
      </div>
      </fieldset>
    </form>
  );
}
