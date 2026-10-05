"use client";

import { useState } from "react";
import { OTHER_PROFESSION, PROFESSIONS, type RegistrationNumberState } from "@/lib/registration-number";

/**
 * Métier et numéro RNA (chantier C4), partagés par l'onboarding et les
 * Paramètres. Le métier reste un texte libre en base (`profession`) : le
 * menu propose les plus courants, « Autre » ouvre un champ.
 */

function presetOf(value: string): string {
  if ((PROFESSIONS as readonly string[]).includes(value)) return value;
  return value.trim() ? OTHER_PROFESSION : "";
}

export function ProfessionField({ id, value, onChange, inputClassName, labelClassName, label = "Métier" }: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  inputClassName: string;
  labelClassName: string;
  label?: string;
}) {
  const [choice, setChoice] = useState(() => presetOf(value));
  // Ce qui a été écrit dans « Autre » survit à un aller-retour dans le menu.
  const [other, setOther] = useState(() => (presetOf(value) === OTHER_PROFESSION ? value : ""));

  return (
    <div className="space-y-3">
      <div>
        <label htmlFor={id} className={labelClassName}>{label}</label>
        <select
          id={id}
          value={choice}
          onChange={(event) => {
            const next = event.target.value;
            setChoice(next);
            onChange(next === OTHER_PROFESSION ? other : next);
          }}
          className={inputClassName}
        >
          <option value="" disabled>Choisissez votre métier</option>
          {PROFESSIONS.map((profession) => <option key={profession} value={profession}>{profession}</option>)}
          <option value={OTHER_PROFESSION}>Autre</option>
        </select>
      </div>
      {choice === OTHER_PROFESSION ? (
        <div>
          <label htmlFor={`${id}-other`} className={labelClassName}>Précisez votre métier</label>
          <input
            id={`${id}-other`}
            value={other}
            onChange={(event) => {
              setOther(event.target.value);
              onChange(event.target.value);
            }}
            className={inputClassName}
            placeholder="Ex. masseur canin"
          />
        </div>
      ) : null}
    </div>
  );
}

const REGISTRATION_HINTS: Record<RegistrationNumberState, string> = {
  toVerify: "Votre numéro d’inscription au registre tenu par l’Ordre des vétérinaires. Il sera vérifié avant l’ouverture de votre espace.",
  once: "Votre numéro d’inscription au registre tenu par l’Ordre des vétérinaires. Une fois enregistré, seul le support pourra le modifier.",
  locked: "Numéro vérifié. Contactez le support pour le modifier.",
};

/**
 * Numéro RNA d'un ostéopathe (`rna`), ou numéro d'agrément facultatif des
 * autres métiers. Figé, il ne se modifie plus que par le support (le
 * serveur le refuse de toute façon).
 */
export function RegistrationNumberField({ id, value, onChange, inputClassName, labelClassName, state = "toVerify", rna = true }: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  inputClassName: string;
  labelClassName: string;
  state?: RegistrationNumberState;
  rna?: boolean;
}) {
  const locked = state === "locked";
  const hint = rna || locked ? REGISTRATION_HINTS[state] : state === "once" ? "Une fois enregistré, seul le support pourra le modifier." : null;
  return (
    <div>
      <label htmlFor={id} className={labelClassName}>{rna ? "Numéro RNA (Registre national d’aptitude)" : "N° d’agrément / certification (facultatif)"}</label>
      <input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        readOnly={locked}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className={`${inputClassName} ${locked ? "cursor-not-allowed opacity-70" : ""}`}
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        placeholder={rna ? undefined : "Ex. OA1951"}
      />
      {hint ? <p id={`${id}-hint`} className="mt-1.5 text-xs text-animeo-muted">{hint}</p> : null}
    </div>
  );
}
