"use client";

import { useActionState, useState, useTransition } from "react";
import { verifyTwoFactorCode, resendTwoFactorCode, type TwoFactorState } from "@/lib/auth/two-factor-actions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const inputClassName = "h-12 w-full rounded-[12px] border border-animeo-border bg-animeo-bg px-4 text-center text-lg font-black tracking-[0.3em] text-animeo-dark outline-none transition placeholder:tracking-normal placeholder:text-sm placeholder:font-semibold placeholder:text-animeo-subtle focus:border-animeo focus:bg-white";

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
          <span className="mb-1.5 block text-xs font-extrabold uppercase tracking-[0.12em] text-animeo-muted">Code de vérification</span>
          <input type="text" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required placeholder="000000" className={inputClassName} />
        </label>

        {state?.error ? (
          <p role="alert" className="rounded-[12px] bg-animeo-danger-soft px-4 py-3 text-sm font-bold text-animeo-danger">{state.error}</p>
        ) : null}

        {resent ? (
          <p role="status" className="rounded-[12px] bg-animeo-soft px-4 py-3 text-sm font-bold text-animeo-dark">Un nouveau code vient d’être envoyé.</p>
        ) : null}

        <Button type="submit" disabled={pending} className="w-full">{pending ? "Vérification…" : "Valider"}</Button>

        <Button type="button" variant="secondary" disabled={resending} onClick={() => startResend(async () => { await resendTwoFactorCode(); setResent(true); })} className="w-full">
          {resending ? "Envoi…" : "Renvoyer un code"}
        </Button>
      </form>
    </Card>
  );
}
