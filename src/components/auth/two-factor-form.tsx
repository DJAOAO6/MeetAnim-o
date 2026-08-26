"use client";

import { useActionState, useState, useTransition } from "react";
import { verifyTwoFactorCode, resendTwoFactorCode, type TwoFactorState } from "@/lib/auth/two-factor-actions";
import { Card } from "@/components/ui/card";

const inputClassName = "h-12 w-full rounded-[12px] border border-[#d9e5e2] bg-animeo-bg px-4 text-center text-lg font-black tracking-[0.3em] text-animeo-dark outline-none transition placeholder:tracking-normal placeholder:text-sm placeholder:font-semibold placeholder:text-[#9aa6aa] focus:border-animeo focus:bg-white";

export function TwoFactorForm() {
  const [state, action, pending] = useActionState<TwoFactorState, FormData>(verifyTwoFactorCode, undefined);
  const [resending, startResend] = useTransition();
  const [resent, setResent] = useState(false);

  return (
    <Card className="p-6 sm:p-8">
      <h1 className="text-xl font-extrabold text-animeo-dark">Vérification en deux étapes</h1>
      <p className="mt-1.5 text-sm text-animeo-muted">Un code à 6 chiffres vient de vous être envoyé par email. Il est valable 10 minutes.</p>

      <form action={action} className="mt-6 space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-[11px] font-extrabold uppercase tracking-[0.12em] text-animeo-muted">Code de vérification</span>
          <input type="text" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required placeholder="000000" className={inputClassName} />
        </label>

        {state?.error ? (
          <p role="alert" className="rounded-[12px] bg-[#fff1f1] px-4 py-3 text-sm font-bold text-animeo-error">{state.error}</p>
        ) : null}

        {resent ? (
          <p role="status" className="rounded-[12px] bg-animeo-soft px-4 py-3 text-sm font-bold text-animeo-dark">Un nouveau code vient d’être envoyé.</p>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className="flex h-12 w-full items-center justify-center rounded-[12px] bg-animeo font-extrabold text-white shadow-[0_8px_20px_rgba(79,175,159,0.22)] transition hover:-translate-y-0.5 hover:bg-[#459e90] disabled:pointer-events-none disabled:opacity-70"
        >
          {pending ? "Vérification…" : "Valider"}
        </button>

        <button
          type="button"
          disabled={resending}
          onClick={() => startResend(async () => { await resendTwoFactorCode(); setResent(true); })}
          className="flex h-11 w-full items-center justify-center rounded-[12px] text-sm font-extrabold text-animeo transition hover:underline disabled:pointer-events-none disabled:opacity-70"
        >
          {resending ? "Envoi…" : "Renvoyer un code"}
        </button>
      </form>
    </Card>
  );
}
