"use client";

import { useActionState, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { notify } from "@/lib/notify";
import { changePasswordAction, revokeOtherSessionsAction, setOwnTwoFactorAction, type AccountOverview, type AccountResult } from "@/lib/auth/account-actions";

const inputClassName = "h-12 w-full rounded-[12px] border border-animeo-border bg-animeo-bg px-4 text-sm font-semibold text-animeo-dark outline-none transition focus:border-animeo focus:bg-white";
const dateFormatter = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" });

function Field({ label, name, autoComplete }: { label: string; name: string; autoComplete: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-extrabold uppercase tracking-[0.12em] text-animeo-muted">{label}</span>
      <input type="password" name={name} autoComplete={autoComplete} required className={inputClassName} />
    </label>
  );
}

function Outcome({ result }: { result: AccountResult | undefined }) {
  if (!result) return null;
  return result.ok
    ? <p role="status" className="rounded-[12px] bg-animeo-soft px-4 py-3 text-sm font-bold text-animeo-dark">{result.message}</p>
    : <p role="alert" className="rounded-[12px] bg-animeo-danger-soft px-4 py-3 text-sm font-bold text-animeo-danger">{result.error}</p>;
}

/** Un nom lisible pour un navigateur, d'après ce qu'il annonce. */
function deviceLabel(userAgent: string | null): string {
  if (!userAgent) return "Appareil inconnu";
  const browser = /Edg\//.test(userAgent) ? "Edge" : /Firefox\//.test(userAgent) ? "Firefox" : /Chrome\//.test(userAgent) ? "Chrome" : /Safari\//.test(userAgent) ? "Safari" : "Navigateur";
  const system = /iPhone|iPad/.test(userAgent) ? "iPhone ou iPad" : /Android/.test(userAgent) ? "Android" : /Windows/.test(userAgent) ? "Windows" : /Mac OS X/.test(userAgent) ? "Mac" : /Linux/.test(userAgent) ? "Linux" : "système inconnu";
  return `${browser} sur ${system}`;
}

export function AccountSettings({ overview }: { overview: AccountOverview }) {
  const [passwordResult, changePassword, changingPassword] = useActionState<AccountResult | undefined, FormData>(changePasswordAction, undefined);
  const [twoFactorPassword, setTwoFactorPassword] = useState("");
  const [twoFactorResult, setTwoFactorResult] = useState<AccountResult | undefined>();
  const [togglingTwoFactor, startTwoFactor] = useTransition();
  const [revoking, startRevoking] = useTransition();

  function toggleTwoFactor() {
    startTwoFactor(async () => {
      const result = await setOwnTwoFactorAction(!overview.twoFactorEnabled, twoFactorPassword);
      setTwoFactorResult(result);
      if (result.ok) setTwoFactorPassword("");
    });
  }

  function revokeOthers() {
    startRevoking(async () => {
      const result = await revokeOtherSessionsAction();
      if (result.ok) notify.success(result.message);
      else notify.error(result.error);
    });
  }

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card className="p-5 sm:p-6">
        <h2 className="font-extrabold text-animeo-dark">Mot de passe</h2>
        <p className="mt-1 text-sm text-animeo-muted">10 caractères au moins, avec une minuscule, une majuscule, un chiffre et un caractère spécial. Vos autres appareils seront déconnectés.</p>
        <form action={changePassword} className="mt-4 space-y-3">
          <Field label="Mot de passe actuel" name="currentPassword" autoComplete="current-password" />
          <Field label="Nouveau mot de passe" name="newPassword" autoComplete="new-password" />
          <Field label="Nouveau mot de passe, encore" name="confirmPassword" autoComplete="new-password" />
          <Outcome result={passwordResult} />
          <Button type="submit" disabled={changingPassword}>{changingPassword ? "Enregistrement…" : "Changer le mot de passe"}</Button>
        </form>
      </Card>

      <Card className="p-5 sm:p-6">
        <h2 className="font-extrabold text-animeo-dark">Double authentification</h2>
        <p className="mt-1 text-sm text-animeo-muted">
          {overview.twoFactorEnabled
            ? "Activée : un code envoyé par e-mail vous est demandé à chaque connexion. Même avec votre mot de passe, personne n’entre sans ce code."
            : "Désactivée. Activez-la : un code envoyé par e-mail sera demandé à chaque connexion, ce qui protège votre espace si votre mot de passe fuit."}
        </p>
        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-xs font-extrabold uppercase tracking-[0.12em] text-animeo-muted">Mot de passe actuel, pour confirmer</span>
            <input type="password" value={twoFactorPassword} onChange={(event) => setTwoFactorPassword(event.target.value)} autoComplete="current-password" className={inputClassName} />
          </label>
          <Outcome result={twoFactorResult} />
          <Button type="button" variant={overview.twoFactorEnabled ? "secondary" : "primary"} disabled={togglingTwoFactor || !twoFactorPassword || (overview.twoFactorEnabled && overview.platformAdmin)} onClick={toggleTwoFactor}>
            {togglingTwoFactor ? "Enregistrement…" : overview.twoFactorEnabled ? "Désactiver" : "Activer la double authentification"}
          </Button>
        </div>
      </Card>

      <Card className="p-5 sm:p-6 xl:col-span-2">
        <h2 className="font-extrabold text-animeo-dark">Appareils connectés</h2>
        <p className="mt-1 text-sm text-animeo-muted">Les sessions ouvertes avec votre compte. Une session dure 7 jours au plus.</p>
        <ul className="mt-4 divide-y divide-animeo-border-soft">
          {overview.sessions.map((session) => (
            <li key={session.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
              <span className="font-bold text-animeo-dark">{deviceLabel(session.userAgent)}{session.current ? <span className="ml-2 rounded-full bg-animeo-soft px-2 py-0.5 text-xs font-extrabold">Cet appareil</span> : null}</span>
              <span className="text-animeo-muted">Connexion le {dateFormatter.format(new Date(session.createdAt))}</span>
            </li>
          ))}
        </ul>
        <Button type="button" variant="secondary" className="mt-4" disabled={revoking || overview.sessions.every((session) => session.current)} onClick={revokeOthers}>
          {revoking ? "Déconnexion…" : "Déconnecter les autres appareils"}
        </Button>
      </Card>
    </div>
  );
}
