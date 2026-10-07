"use client";

import { useState, type ReactNode } from "react";
import { inputClassName, textareaClassName } from "@/components/settings/settings-fields";
import { BreedCombobox } from "@/components/ui/breed-combobox";
import { animalSpeciesList } from "@/data/species";
import { isKnownBreed } from "@/data/breeds";
import type { PublicAnimalType } from "@/data/public-booking";
import { computeAgeLabel } from "@/lib/animal-age";
import { sexOf, splitSex, validateAnimal, type AnimalFieldErrors, type SexBase } from "@/lib/animal-validation";

/**
 * Les champs d'une fiche animal, identiques partout : fiche client (ajout et
 * modification), ajout rapide depuis un rendez-vous, nouveau client. Sans
 * fenêtre ni bouton — chaque écran les pose dans son propre cadre.
 *
 * Obligatoires : nom, espèce, sexe (la même règle que le serveur :
 * animal-validation.ts).
 */

export type AnimalDraft = {
  name: string;
  species: string;
  breed: string;
  /** Une des quatre valeurs, une ancienne valeur gardée telle quelle, ou vide. */
  sex: string;
  birthDate: string;
  birthDateApproximate: boolean;
  /** Âge en texte, pour un animal sans date de naissance. */
  age: string;
  weight: string;
  history: string;
  conditions: string;
  treatments: string;
  notes: string;
};

export const emptyAnimalDraft: AnimalDraft = {
  name: "",
  species: "",
  breed: "",
  sex: "",
  birthDate: "",
  birthDateApproximate: false,
  age: "",
  weight: "",
  history: "",
  conditions: "",
  treatments: "",
  notes: "",
};

/** Ce que les actions serveur reçoivent. */
export function animalInputFrom(draft: AnimalDraft) {
  return { ...draft, birthDate: draft.birthDate || null, age: draft.birthDate ? "" : draft.age };
}

/** Validation avant envoi : la même que celle du serveur. */
export function validateAnimalDraft(draft: AnimalDraft, previous?: { species: string; sex: string }): AnimalFieldErrors {
  const result = validateAnimal(animalInputFrom(draft), previous);
  return result.ok ? {} : result.errors;
}

const FIELD_ORDER = ["name", "species", "sex", "birthDate"] as const;

/** Les erreurs, sans celles des champs que l'on vient de modifier. */
export function withoutChangedErrors(errors: AnimalFieldErrors, patch: Partial<AnimalDraft>): AnimalFieldErrors {
  const next = { ...errors };
  for (const key of Object.keys(patch)) delete next[key as keyof AnimalFieldErrors];
  return next;
}

/** Met le focus sur le premier champ en erreur. */
export function focusFirstAnimalError(idPrefix: string, errors: AnimalFieldErrors) {
  const field = FIELD_ORDER.find((key) => errors[key]);
  if (!field) return;
  const target = field === "sex" ? document.querySelector<HTMLInputElement>(`#${idPrefix}-sex input`) : document.getElementById(`${idPrefix}-${field}`);
  target?.focus();
}

const labelClassName = "mb-2 block text-xs font-extrabold uppercase tracking-[0.11em] text-animeo-muted";

function FieldBlock({ id, label, error, hint, children }: { id: string; label: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className={labelClassName}>{label}</label>
      {children}
      {hint ? <p id={`${id}-hint`} className="mt-1.5 text-xs text-animeo-muted">{hint}</p> : null}
      {error ? <p id={`${id}-error`} className="mt-1.5 text-xs font-bold text-animeo-danger">{error}</p> : null}
    </div>
  );
}

function describedBy(id: string, error?: string, hint?: string) {
  return [hint ? `${id}-hint` : "", error ? `${id}-error` : ""].filter(Boolean).join(" ") || undefined;
}

export function AnimalFields({ idPrefix, draft, onChange, errors = {}, previousSex }: {
  idPrefix: string;
  draft: AnimalDraft;
  onChange: (patch: Partial<AnimalDraft>) => void;
  errors?: AnimalFieldErrors;
  /** Sexe enregistré avant modification : une ancienne valeur s'affiche telle quelle. */
  previousSex?: string;
}) {
  const id = (field: string) => `${idPrefix}-${field}`;
  // Pas de naissance dans le futur : borne fixée à l'ouverture.
  const [today] = useState(() => new Date().toISOString().slice(0, 10));
  const knownSpecies = (animalSpeciesList as readonly string[]).includes(draft.species);
  const sex = splitSex(draft.sex);
  const legacySex = draft.sex && !sex ? draft.sex : null;
  const computedAge = draft.birthDate ? computeAgeLabel({ date: draft.birthDate, approximate: draft.birthDateApproximate }) : null;
  const neuteredLabel = draft.species === "Cheval" ? (sex?.base === "Femelle" ? "Stérilisée" : "Hongre (castré)") : (sex?.base === "Femelle" ? "Stérilisée" : "Castré");

  function changeSpecies(species: string) {
    // Une race connue de l'ancienne espèce n'a plus de sens ; une saisie libre reste.
    const keepBreed = !(knownSpecies && isKnownBreed(draft.species as PublicAnimalType, draft.breed));
    onChange({ species, breed: keepBreed ? draft.breed : "" });
  }

  function chooseSex(base: SexBase) {
    onChange({ sex: sexOf(base, sex?.neutered ?? false) });
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <FieldBlock id={id("name")} label="Nom *" error={errors.name}>
          <input id={id("name")} value={draft.name} onChange={(event) => onChange({ name: event.target.value })} className={inputClassName} autoComplete="off" aria-invalid={Boolean(errors.name) || undefined} aria-describedby={describedBy(id("name"), errors.name)} />
        </FieldBlock>
        <FieldBlock id={id("species")} label="Espèce *" error={errors.species}>
          <select id={id("species")} value={draft.species} onChange={(event) => changeSpecies(event.target.value)} className={inputClassName} aria-invalid={Boolean(errors.species) || undefined} aria-describedby={describedBy(id("species"), errors.species)}>
            {draft.species === "" ? <option value="">Choisir…</option> : null}
            {animalSpeciesList.map((species) => <option key={species} value={species}>{species}</option>)}
            {draft.species && !knownSpecies ? <option value={draft.species}>{draft.species}</option> : null}
          </select>
        </FieldBlock>
        <FieldBlock id={id("breed")} label="Race">
          <BreedCombobox
            id={id("breed")}
            inputClassName={inputClassName}
            species={(knownSpecies ? draft.species : "Chien") as PublicAnimalType}
            value={draft.breed}
            onChange={(breed) => onChange({ breed })}
            placeholder="Commencez à taper…"
          />
        </FieldBlock>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <span id={id("sex-label")} className={labelClassName}>Sexe *</span>
          <div id={id("sex")} role="radiogroup" aria-labelledby={id("sex-label")} aria-invalid={Boolean(errors.sex) || undefined} aria-describedby={errors.sex ? id("sex-error") : undefined} className="inline-flex gap-1 rounded-xl bg-animeo-bg p-1">
            {(["Mâle", "Femelle"] as const).map((base) => (
              <label key={base} className={`flex min-h-10 cursor-pointer items-center rounded-lg px-4 text-sm font-extrabold transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-animeo ${sex?.base === base ? "bg-animeo-surface text-animeo-dark shadow-sm" : "text-animeo-muted hover:text-animeo-dark"}`}>
                <input type="radio" name={id("sex")} value={base} checked={sex?.base === base} onChange={() => chooseSex(base)} className="sr-only" />
                {base}
              </label>
            ))}
          </div>
          {sex ? (
            <label className="mt-2 flex items-center gap-2 text-sm font-bold text-animeo-dark">
              <input type="checkbox" checked={sex.neutered} onChange={(event) => onChange({ sex: sexOf(sex.base, event.target.checked) })} className="h-4 w-4 accent-[var(--theme-brand)]" />
              {neuteredLabel}
            </label>
          ) : null}
          {legacySex && legacySex === previousSex ? <p className="mt-1.5 text-xs text-animeo-muted">Valeur enregistrée : « {legacySex} ». Choisissez Mâle ou Femelle pour la préciser.</p> : null}
          {errors.sex ? <p id={id("sex-error")} className="mt-1.5 text-xs font-bold text-animeo-danger">{errors.sex}</p> : null}
        </div>
        <FieldBlock id={id("birthDate")} label="Date de naissance" error={errors.birthDate}>
          <input id={id("birthDate")} type="date" value={draft.birthDate} max={today} onChange={(event) => onChange({ birthDate: event.target.value, birthDateApproximate: false })} className={inputClassName} aria-invalid={Boolean(errors.birthDate) || undefined} aria-describedby={describedBy(id("birthDate"), errors.birthDate)} />
        </FieldBlock>
        <FieldBlock id={id("age")} label="Âge" hint={computedAge ? "Calculé depuis la date de naissance." : undefined}>
          <input id={id("age")} value={computedAge ?? draft.age} disabled={Boolean(computedAge)} onChange={(event) => onChange({ age: event.target.value })} className={`${inputClassName} disabled:opacity-70`} placeholder="Ex. environ 5 ans" aria-describedby={describedBy(id("age"), undefined, computedAge ? "calculé" : undefined)} />
        </FieldBlock>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <FieldBlock id={id("weight")} label="Poids">
          <input id={id("weight")} value={draft.weight} onChange={(event) => onChange({ weight: event.target.value })} className={inputClassName} placeholder="Ex. 28 kg" autoComplete="off" />
        </FieldBlock>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FieldBlock id={id("history")} label="Antécédents">
          <textarea id={id("history")} value={draft.history} onChange={(event) => onChange({ history: event.target.value })} className={textareaClassName} />
        </FieldBlock>
        <FieldBlock id={id("conditions")} label="Pathologies / sensibilités">
          <textarea id={id("conditions")} value={draft.conditions} onChange={(event) => onChange({ conditions: event.target.value })} className={textareaClassName} />
        </FieldBlock>
        <FieldBlock id={id("treatments")} label="Traitements">
          <textarea id={id("treatments")} value={draft.treatments} onChange={(event) => onChange({ treatments: event.target.value })} className={textareaClassName} />
        </FieldBlock>
        <FieldBlock id={id("notes")} label="Notes">
          <textarea id={id("notes")} value={draft.notes} onChange={(event) => onChange({ notes: event.target.value })} className={textareaClassName} />
        </FieldBlock>
      </div>
    </div>
  );
}
