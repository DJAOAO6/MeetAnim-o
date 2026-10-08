"use client";

import { useActionState } from "react";
import { resetPassword, type ResetPasswordState } from "@/lib/auth/password-reset-actions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const inputClassName = "h-12 w-full rounded-[12px] border border-animeo-border bg-animeo-bg px-4 text-sm font-semibold text-animeo-dark outline-none transition placeholder:text-animeo-subtle focus:border-animeo focus:bg-white";

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<ResetPasswordState, FormData>(resetPassword, undefined);

  return (
    <Card className="p-6 sm:p-8">
      <h1 className="text-xl font-extrabold text-animeo-dark">Nouveau mot de passe</h1>
      <p className="mt-1.5 text-sm text-animeo-muted">Au moins 10 caractères, avec majuscule, minuscule, chiffre et caractère spécial.</p>

      <form action={action} className="mt-6 space-y-4">
        <input type="hidden" name="token" value={token} />
        <label className="block">
          <span className="mb-1.5 block text-xs font-extrabold uppercase tracking-[0.12em] text-animeo-muted">Nouveau mot de passe</span>
          <input type="password" name="password" required autoComplete="new-password" className={inputClassName} />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-extrabold uppercase tracking-[0.12em] text-animeo-muted">Confirmer le mot de passe</span>
          <input type="password" name="confirmPassword" required autoComplete="new-password" className={inputClassName} />
        </label>

        {state?.error ? (
          <p role="alert" className="rounded-[12px] bg-animeo-danger-soft px-4 py-3 text-sm font-bold text-animeo-danger">{state.error}</p>
        ) : null}

        <Button type="submit" disabled={pending} className="w-full">{pending ? "Enregistrement…" : "Réinitialiser le mot de passe"}</Button>
      </form>
    </Card>
  );
}
