"use client";

import { AddressAutocomplete } from "@/components/ui/address-autocomplete";
import { inputClassName } from "@/components/settings/settings-fields";
import { SERVICE_AREA_RADII, serviceAreaText } from "@/lib/service-area";

/**
 * Secteur d'intervention (C4) : la commune d'où l'on part, et jusqu'où l'on se
 * déplace. Le texte de la page publique en est tiré, et un client qui réserve
 * au-delà du rayon en est prévenu (sans être bloqué).
 *
 * La commune doit être choisie dans la liste : c'est ce qui donne ses
 * coordonnées. Une saisie libre non choisie n'est pas enregistrée.
 */

export type ServiceAreaDraft = {
  label: string;
  latitude: number | null;
  longitude: number | null;
  /** null : pas de limite. */
  radiusKm: number | null;
};

/** Le secteur prêt à enregistrer sur le profil, ou des valeurs vides. */
export function serviceAreaFields(draft: ServiceAreaDraft) {
  const located = draft.label.trim() && draft.latitude !== null && draft.longitude !== null;
  return located
    ? { serviceAreaLabel: draft.label.trim(), serviceAreaLatitude: draft.latitude, serviceAreaLongitude: draft.longitude, serviceAreaRadiusKm: draft.radiusKm }
    : { serviceAreaLabel: null, serviceAreaLatitude: null, serviceAreaLongitude: null, serviceAreaRadiusKm: null };
}

/** Une commune saisie sans être choisie dans la liste. */
export function serviceAreaUnconfirmed(draft: ServiceAreaDraft): boolean {
  return Boolean(draft.label.trim()) && (draft.latitude === null || draft.longitude === null);
}

const labelClassName = "mb-2 block text-xs font-extrabold uppercase tracking-[0.11em] text-animeo-muted";

export function ServiceAreaFields({ idPrefix, draft, onChange, currentText }: {
  idPrefix: string;
  draft: ServiceAreaDraft;
  onChange: (draft: ServiceAreaDraft) => void;
  /** Texte libre actuel d'un espace sans secteur : gardé tant qu'il n'en choisit pas. */
  currentText?: string;
}) {
  const located = draft.label.trim() && draft.latitude !== null && draft.longitude !== null;
  const unconfirmed = serviceAreaUnconfirmed(draft);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-[1fr_14rem]">
        <div>
          <label htmlFor={`${idPrefix}-from`} className={labelClassName}>D’où partez-vous ?</label>
          <AddressAutocomplete
            id={`${idPrefix}-from`}
            kind="municipality"
            value={draft.label}
            placeholder="Commune de départ"
            inputClassName={inputClassName}
            // Retaper la commune efface ses coordonnées : il faut la rechoisir.
            onQueryChange={(label) => onChange({ ...draft, label, latitude: null, longitude: null })}
            onSelect={(result) => onChange({ ...draft, label: result.city, latitude: result.latitude, longitude: result.longitude })}
            ariaDescribedBy={unconfirmed ? `${idPrefix}-from-hint` : undefined}
            ariaInvalid={unconfirmed}
          />
          {unconfirmed ? <p id={`${idPrefix}-from-hint`} className="mt-1.5 text-xs font-bold text-animeo-danger">Choisissez la commune dans la liste proposée.</p> : null}
        </div>
        <div>
          <label htmlFor={`${idPrefix}-radius`} className={labelClassName}>Jusqu’où vous déplacez-vous ?</label>
          <select id={`${idPrefix}-radius`} value={draft.radiusKm ?? ""} onChange={(event) => onChange({ ...draft, radiusKm: event.target.value ? Number(event.target.value) : null })} className={inputClassName}>
            {SERVICE_AREA_RADII.map((radius) => <option key={radius} value={radius}>{radius} km</option>)}
            <option value="">Pas de limite</option>
          </select>
        </div>
      </div>
      {located ? (
        <p className="rounded-xl bg-animeo-bg px-4 py-3 text-sm text-animeo-dark">
          Sur votre page : <em className="font-bold">{serviceAreaText({ label: draft.label.trim(), radiusKm: draft.radiusKm })}</em>
        </p>
      ) : currentText ? (
        <p className="text-xs text-animeo-muted">Texte actuel de votre page : « {currentText} ». Il reste tant que vous ne choisissez pas de commune.</p>
      ) : null}
    </div>
  );
}
