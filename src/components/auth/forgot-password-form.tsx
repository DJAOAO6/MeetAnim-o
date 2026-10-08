"use client";

import Link from "next/link";
import { useActionState } from "react";
import { requestPasswordReset, type RequestResetState } from "@/lib/auth/password-reset-actions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const inputClassName = "h-12 w-full rounded-[12px] border border-animeo-border bg-animeo-bg px-4 text-sm font-semibold text-animeo-dark outline-none transition placeholder:text-animeo-subtle focus:border-animeo focus:bg-white";

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState<RequestResetState, FormData>(requestPasswordReset, undefined);
  const feedback = state && ("message" in state ? state.message : state.error);

  return (
    <Card className="p-6 sm:p-8">
      <h1 className="text-xl font-extrabold text-animeo-dark">Mot de passe oublié</h1>
      <p className="mt-1.5 text-sm text-animeo-muted">Indiquez votre email professionnel, vous recevrez un lien de réinitialisation s’il correspond à un compte.</p>

      <form action={action} className="mt-6 space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-xs font-extrabold uppercase tracking-[0.12em] text-animeo-muted">Email</span>
          <input type="email" name="email" required autoComplete="email" placeholder="vous@exemple.fr" className={inputClassName} />
        </label>

        {feedback ? (
          <p role="status" className={`rounded-[12px] px-4 py-3 text-sm font-bold ${state && "error" in state ? "bg-animeo-danger-soft text-animeo-danger" : "bg-animeo-soft text-animeo-dark"}`}>{feedback}</p>
        ) : null}

        <Button type="submit" disabled={pending} className="w-full">{pending ? "Envoi…" : "Envoyer le lien"}</Button>

        <Link href="/login" className="flex h-11 w-full items-center justify-center text-sm font-extrabold text-animeo hover:underline">
          Retour à la connexion
        </Link>
      </form>
    </Card>
  );
}
