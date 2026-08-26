"use client";

import { useActionState } from "react";
import { resetPassword, type ResetPasswordState } from "@/lib/auth/password-reset-actions";
import { Card } from "@/components/ui/card";

const inputClassName = "h-12 w-full rounded-[12px] border border-[#d9e5e2] bg-animeo-bg px-4 text-sm font-semibold text-animeo-dark outline-none transition placeholder:text-[#9aa6aa] focus:border-animeo focus:bg-white";

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<ResetPasswordState, FormData>(resetPassword, undefined);

  return (
    <Card className="p-6 sm:p-8">
      <h1 className="text-xl font-extrabold text-animeo-dark">Nouveau mot de passe</h1>
      <p className="mt-1.5 text-sm text-animeo-muted">Au moins 10 caractères, avec majuscule, minuscule, chiffre et caractère spécial.</p>

      <form action={action} className="mt-6 space-y-4">
        <input type="hidden" name="token" value={token} />
        <label className="block">
          <span className="mb-1.5 block text-[11px] font-extrabold uppercase tracking-[0.12em] text-animeo-muted">Nouveau mot de passe</span>
          <input type="password" name="password" required autoComplete="new-password" className={inputClassName} />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[11px] font-extrabold uppercase tracking-[0.12em] text-animeo-muted">Confirmer le mot de passe</span>
          <input type="password" name="confirmPassword" required autoComplete="new-password" className={inputClassName} />
        </label>

        {state?.error ? (
          <p role="alert" className="rounded-[12px] bg-[#fff1f1] px-4 py-3 text-sm font-bold text-animeo-error">{state.error}</p>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className="flex h-12 w-full items-center justify-center rounded-[12px] bg-animeo font-extrabold text-white shadow-[0_8px_20px_rgba(79,175,159,0.22)] transition hover:-translate-y-0.5 hover:bg-[#459e90] disabled:pointer-events-none disabled:opacity-70"
        >
          {pending ? "Enregistrement…" : "Réinitialiser le mot de passe"}
        </button>
      </form>
    </Card>
  );
}
