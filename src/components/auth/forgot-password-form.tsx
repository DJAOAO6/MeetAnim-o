"use client";

import Link from "next/link";
import { useActionState } from "react";
import { requestPasswordReset, type RequestResetState } from "@/lib/auth/password-reset-actions";
import { Card } from "@/components/ui/card";

const inputClassName = "h-12 w-full rounded-[12px] border border-[#d9e5e2] bg-animeo-bg px-4 text-sm font-semibold text-animeo-dark outline-none transition placeholder:text-[#9aa6aa] focus:border-animeo focus:bg-white";

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState<RequestResetState, FormData>(requestPasswordReset, undefined);
  const feedback = state && ("message" in state ? state.message : state.error);

  return (
    <Card className="p-6 sm:p-8">
      <h1 className="text-xl font-extrabold text-animeo-dark">Mot de passe oublié</h1>
      <p className="mt-1.5 text-sm text-animeo-muted">Indiquez votre email professionnel, vous recevrez un lien de réinitialisation s’il correspond à un compte.</p>

      <form action={action} className="mt-6 space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-[11px] font-extrabold uppercase tracking-[0.12em] text-animeo-muted">Email</span>
          <input type="email" name="email" required autoComplete="email" placeholder="vous@exemple.fr" className={inputClassName} />
        </label>

        {feedback ? (
          <p role="status" className={`rounded-[12px] px-4 py-3 text-sm font-bold ${state && "error" in state ? "bg-[#fff1f1] text-animeo-error" : "bg-animeo-soft text-animeo-dark"}`}>{feedback}</p>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className="flex h-12 w-full items-center justify-center rounded-[12px] bg-animeo font-extrabold text-white shadow-[0_8px_20px_rgba(79,175,159,0.22)] transition hover:-translate-y-0.5 hover:bg-[#459e90] disabled:pointer-events-none disabled:opacity-70"
        >
          {pending ? "Envoi…" : "Envoyer le lien"}
        </button>

        <Link href="/login" className="flex h-11 w-full items-center justify-center text-sm font-extrabold text-animeo hover:underline">
          Retour à la connexion
        </Link>
      </form>
    </Card>
  );
}
