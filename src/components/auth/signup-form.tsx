"use client";

import { useActionState } from "react";
import { acceptInvitationAction, type AcceptInvitationState } from "@/lib/platform/invitation-actions";
import { Card } from "@/components/ui/card";

const inputClassName = "h-12 w-full rounded-[12px] border border-animeo-border bg-animeo-bg px-4 text-sm font-semibold text-animeo-dark outline-none transition placeholder:text-animeo-subtle focus:border-animeo focus:bg-white";
const labelClassName = "mb-1.5 block text-[11px] font-extrabold uppercase tracking-[0.12em] text-animeo-muted";

/**
 * Création du compte à partir d'une invitation. L'adresse est celle de
 * l'invitation, affichée mais pas modifiable : c'est en recevant le lien
 * que l'invité a prouvé qu'il la détient.
 */
export function SignupForm({ token, email, organizationName }: { token: string; email: string; organizationName: string }) {
  const [state, action, pending] = useActionState<AcceptInvitationState, FormData>(acceptInvitationAction, undefined);

  return (
    <Card className="p-6 sm:p-8">
      <h1 className="text-xl font-extrabold text-animeo-dark">Ouvrir votre espace</h1>
      <p className="mt-1.5 text-sm text-animeo-muted">
        Votre compte sera celui de l’administrateur de l’espace. Vous le configurerez juste après : mode d’exercice, horaires, prestations, lien de réservation.
      </p>

      <form action={action} className="mt-6 space-y-4">
        <input type="hidden" name="token" value={token} />
        <div>
          <span className={labelClassName}>Adresse e-mail</span>
          <p className="flex h-12 items-center rounded-[12px] border border-animeo-border-soft bg-animeo-soft px-4 text-sm font-bold text-animeo-dark">{email}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className={labelClassName}>Prénom</span>
            <input name="firstName" required maxLength={120} autoComplete="given-name" className={inputClassName} />
          </label>
          <label className="block">
            <span className={labelClassName}>Nom</span>
            <input name="lastName" required maxLength={120} autoComplete="family-name" className={inputClassName} />
          </label>
        </div>
        <label className="block">
          <span className={labelClassName}>Nom de votre activité</span>
          <input name="organizationName" required maxLength={120} defaultValue={organizationName} autoComplete="organization" className={inputClassName} />
        </label>
        <div>
          <label className="block">
            <span className={labelClassName}>Mot de passe</span>
            <input type="password" name="password" required autoComplete="new-password" aria-describedby="signup-password-hint" className={inputClassName} />
          </label>
          <p id="signup-password-hint" className="mt-1.5 text-xs text-animeo-muted">Au moins 10 caractères, avec majuscule, minuscule, chiffre et caractère spécial.</p>
        </div>
        <label className="block">
          <span className={labelClassName}>Confirmer le mot de passe</span>
          <input type="password" name="confirmPassword" required autoComplete="new-password" className={inputClassName} />
        </label>

        {state?.error ? (
          <p role="alert" className="rounded-[12px] bg-animeo-danger-soft px-4 py-3 text-sm font-bold text-animeo-error">{state.error}</p>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className="flex h-12 w-full items-center justify-center rounded-[12px] bg-animeo font-extrabold text-white shadow-[0_8px_20px_color-mix(in_srgb,var(--theme-brand)_22%,transparent)] transition hover:-translate-y-0.5 hover:bg-animeo-hover disabled:pointer-events-none disabled:opacity-70"
        >
          {pending ? "Création de votre espace…" : "Créer mon compte"}
        </button>
      </form>
    </Card>
  );
}
