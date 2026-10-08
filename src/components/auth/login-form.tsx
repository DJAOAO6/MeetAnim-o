"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { login, type LoginState } from "@/lib/auth/actions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Eye, EyeOff } from "lucide-react";

const inputClassName = "h-12 w-full rounded-[12px] border border-animeo-border bg-animeo-bg px-4 text-sm font-semibold text-animeo-dark outline-none transition placeholder:text-animeo-subtle focus:border-animeo focus:bg-white";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, undefined);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <Card className="p-6 sm:p-8">
      <h1 className="text-xl font-extrabold text-animeo-dark">Connexion</h1>
      <p className="mt-1.5 text-sm text-animeo-muted">Accédez à votre tableau de bord professionnel.</p>

      <form action={action} className="mt-6 space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-xs font-extrabold uppercase tracking-[0.12em] text-animeo-muted">Email</span>
          <input type="email" name="email" required autoComplete="email" placeholder="vous@exemple.fr" className={inputClassName} />
        </label>

        <label className="block">
          <span className="mb-1.5 flex items-center justify-between text-xs font-extrabold uppercase tracking-[0.12em] text-animeo-muted">
            Mot de passe
            <Link href="/mot-de-passe-oublie" className="normal-case tracking-normal text-animeo hover:underline">Mot de passe oublié ?</Link>
          </span>
          <div className="relative">
            <input type={showPassword ? "text" : "password"} name="password" required autoComplete="current-password" placeholder="••••••••" className={`${inputClassName} pr-12`} />
            <div className="absolute right-0.5 top-0.5">
              <IconButton label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"} aria-pressed={showPassword} onClick={() => setShowPassword((current) => !current)} tooltipAlign="end" className="border-transparent! bg-transparent!">
                {showPassword ? <EyeOff aria-hidden="true" className="h-5 w-5" /> : <Eye aria-hidden="true" className="h-5 w-5" />}
              </IconButton>
            </div>
          </div>
        </label>

        {state?.error ? (
          <p role="alert" className="rounded-[12px] bg-animeo-danger-soft px-4 py-3 text-sm font-bold text-animeo-danger">{state.error}</p>
        ) : null}

        <Button type="submit" disabled={pending} className="w-full">{pending ? "Connexion…" : "Se connecter"}</Button>
      </form>
    </Card>
  );
}
