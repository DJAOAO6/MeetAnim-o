"use client";

import { useActionState, useState } from "react";
import { login, type LoginState } from "@/lib/auth/actions";
import { Card } from "@/components/ui/card";

const inputClassName = "h-12 w-full rounded-[12px] border border-[#d9e5e2] bg-animeo-bg px-4 text-sm font-semibold text-animeo-dark outline-none transition placeholder:text-[#9aa6aa] focus:border-animeo focus:bg-white";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, undefined);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <Card className="p-6 sm:p-8">
      <h1 className="text-xl font-extrabold text-animeo-dark">Connexion</h1>
      <p className="mt-1.5 text-sm text-animeo-muted">Accédez à votre tableau de bord professionnel.</p>

      <form action={action} className="mt-6 space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-[11px] font-extrabold uppercase tracking-[0.12em] text-animeo-muted">Email</span>
          <input type="email" name="email" required autoComplete="email" placeholder="vous@exemple.fr" className={inputClassName} />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-[11px] font-extrabold uppercase tracking-[0.12em] text-animeo-muted">Mot de passe</span>
          <div className="relative">
            <input type={showPassword ? "text" : "password"} name="password" required autoComplete="current-password" placeholder="••••••••" className={`${inputClassName} pr-16`} />
            <button
              type="button"
              onClick={() => setShowPassword((current) => !current)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-extrabold text-animeo hover:underline"
            >
              {showPassword ? "Masquer" : "Afficher"}
            </button>
          </div>
        </label>

        {state?.error ? (
          <p role="alert" className="rounded-[12px] bg-[#fff1f1] px-4 py-3 text-sm font-bold text-animeo-error">{state.error}</p>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className="flex h-12 w-full items-center justify-center rounded-[12px] bg-animeo font-extrabold text-white shadow-[0_8px_20px_rgba(79,175,159,0.22)] transition hover:-translate-y-0.5 hover:bg-[#459e90] disabled:pointer-events-none disabled:opacity-70"
        >
          {pending ? "Connexion…" : "Se connecter"}
        </button>
      </form>
    </Card>
  );
}
