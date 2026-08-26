"use client";

import { useActionState, useState, useTransition } from "react";
import { Card } from "@/components/ui/card";
import { createUser, setUserActive, setUserRole, setUserTwoFactor, type CreateUserState } from "@/lib/admin/actions";
import { roleLabels, type AdminUser } from "@/data/admin";

const inputClassName = "h-11 w-full rounded-[12px] border border-[#d9e5e2] bg-animeo-bg px-3 text-sm font-semibold text-animeo-dark outline-none transition focus:border-animeo focus:bg-white";

export function UsersTab({ users }: { users: AdminUser[] }) {
  const [state, action, pending] = useActionState<CreateUserState, FormData>(createUser, undefined);
  const [showForm, setShowForm] = useState(false);

  return (
    <div className="space-y-6">
      <Card className="p-5 sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-extrabold text-animeo-dark">Comptes de l’équipe</h2>
            <p className="mt-1 text-sm text-animeo-muted">{users.length} compte{users.length > 1 ? "s" : ""}</p>
          </div>
          <button type="button" onClick={() => setShowForm((current) => !current)} className="inline-flex items-center rounded-xl bg-animeo px-4 py-2.5 text-sm font-extrabold text-white transition hover:bg-[#459e90]">
            {showForm ? "Annuler" : "+ Nouveau compte"}
          </button>
        </div>

        {showForm ? (
          <form action={action} className="mb-6 grid gap-3 rounded-2xl border border-[#e3ece9] bg-animeo-bg p-4 sm:grid-cols-2 xl:grid-cols-5">
            <label className="block">
              <span className="mb-1 block text-[11px] font-extrabold uppercase tracking-[0.1em] text-animeo-muted">Prénom</span>
              <input name="firstName" required className={inputClassName} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-extrabold uppercase tracking-[0.1em] text-animeo-muted">Nom</span>
              <input name="lastName" required className={inputClassName} />
            </label>
            <label className="block xl:col-span-2">
              <span className="mb-1 block text-[11px] font-extrabold uppercase tracking-[0.1em] text-animeo-muted">Email</span>
              <input type="email" name="email" required className={inputClassName} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-extrabold uppercase tracking-[0.1em] text-animeo-muted">Rôle</span>
              <select name="role" defaultValue="PRACTITIONER" className={inputClassName}>
                <option value="ADMIN">Administrateur</option>
                <option value="PRACTITIONER">Praticien</option>
                <option value="SECRETARY">Secrétariat</option>
              </select>
            </label>
            <div className="sm:col-span-2 xl:col-span-5">
              <button type="submit" disabled={pending} className="inline-flex items-center rounded-xl bg-animeo-dark px-4 py-2.5 text-sm font-extrabold text-white transition hover:bg-[#214d59] disabled:opacity-70">
                {pending ? "Création…" : "Créer le compte"}
              </button>
            </div>

            {state?.error ? <p role="alert" className="sm:col-span-2 xl:col-span-5 rounded-[12px] bg-[#fff1f1] px-4 py-3 text-sm font-bold text-animeo-error">{state.error}</p> : null}
            {state?.resetUrl ? (
              <div className="sm:col-span-2 xl:col-span-5 rounded-[12px] bg-animeo-soft px-4 py-3 text-sm text-animeo-dark">
                <p className="font-extrabold">Compte créé.</p>
                <p className="mt-1">Un email d’invitation a été envoyé. Si l’envoi n’aboutit pas (emailing pas encore configuré), transmettez ce lien manuellement — valable 24h :</p>
                <code className="mt-2 block break-all rounded-lg bg-white px-3 py-2 text-xs">{state.resetUrl}</code>
              </div>
            ) : null}
          </form>
        ) : null}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left">
            <thead className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-animeo-muted">
              <tr>
                <th className="px-3 py-2.5">Compte</th>
                <th className="px-3 py-2.5">Rôle</th>
                <th className="px-3 py-2.5">2FA email</th>
                <th className="px-3 py-2.5">Statut</th>
                <th className="px-3 py-2.5">Dernière connexion</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#edf2f0]">
              {users.map((user) => <UserRow key={user.id} user={user} />)}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function UserRow({ user }: { user: AdminUser }) {
  const [pending, startTransition] = useTransition();

  return (
    <tr className={pending ? "opacity-50" : ""}>
      <td className="px-3 py-3">
        <p className="font-extrabold text-animeo-dark">{user.firstName} {user.lastName}</p>
        <p className="text-xs text-animeo-muted">{user.email}</p>
      </td>
      <td className="px-3 py-3">
        <select
          defaultValue={user.role}
          disabled={pending}
          onChange={(event) => startTransition(() => setUserRole(user.id, event.target.value as AdminUser["role"]))}
          className="rounded-lg border border-[#d9e5e2] bg-white px-2 py-1.5 text-xs font-bold text-animeo-dark"
        >
          {Object.entries(roleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </td>
      <td className="px-3 py-3">
        <button
          type="button"
          disabled={pending}
          onClick={() => startTransition(() => setUserTwoFactor(user.id, !user.twoFactorEnabled))}
          className={`rounded-full px-3 py-1 text-[11px] font-black ${user.twoFactorEnabled ? "bg-[#e4f5ef] text-[#267668]" : "bg-animeo-bg text-animeo-muted"}`}
        >
          {user.twoFactorEnabled ? "Activée" : "Désactivée"}
        </button>
      </td>
      <td className="px-3 py-3">
        <button
          type="button"
          disabled={pending}
          onClick={() => startTransition(() => setUserActive(user.id, !user.active))}
          className={`rounded-full px-3 py-1 text-[11px] font-black ${user.active ? "bg-[#e4f5ef] text-[#267668]" : "bg-[#fff1f1] text-animeo-error"}`}
        >
          {user.active ? "Actif" : "Désactivé"}
        </button>
      </td>
      <td className="px-3 py-3 text-xs font-semibold text-animeo-muted">
        {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" }) : "Jamais"}
      </td>
    </tr>
  );
}
