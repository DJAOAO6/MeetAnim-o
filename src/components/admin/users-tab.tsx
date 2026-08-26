"use client";

import { useActionState, useState, useTransition } from "react";
import { Card } from "@/components/ui/card";
import {
  createUser,
  deleteUserAction,
  setUserActive,
  setUserPermissions,
  setUserRole,
  setUserTwoFactor,
  updateUserProfileAction,
  type CreateUserState,
} from "@/lib/admin/actions";
import { permissionKeys, permissionLabels, type PermissionKey } from "@/lib/auth/permissions";
import { roleLabels, type AdminUser } from "@/data/admin";

const inputClassName = "h-11 w-full rounded-[12px] border border-[#d9e5e2] bg-animeo-bg px-3 text-sm font-semibold text-animeo-dark outline-none transition focus:border-animeo focus:bg-white";

export function UsersTab({ users, currentUserId }: { users: AdminUser[]; currentUserId: string }) {
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
          <table className="w-full min-w-[860px] border-collapse text-left">
            <thead className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-animeo-muted">
              <tr>
                <th className="px-3 py-2.5">Compte</th>
                <th className="px-3 py-2.5">Rôle</th>
                <th className="px-3 py-2.5">2FA email</th>
                <th className="px-3 py-2.5">Statut</th>
                <th className="px-3 py-2.5">Dernière connexion</th>
                <th className="px-3 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#edf2f0]">
              {users.map((user) => <UserRow key={user.id} user={user} isSelf={user.id === currentUserId} />)}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function UserRow({ user, isSelf }: { user: AdminUser; isSelf: boolean }) {
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [managingPermissions, setManagingPermissions] = useState(false);
  const [draft, setDraft] = useState({ firstName: user.firstName, lastName: user.lastName, email: user.email });
  const [editError, setEditError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function saveEdit() {
    startTransition(async () => {
      setEditError(null);
      const result = await updateUserProfileAction(user.id, draft);
      if (!result.ok) {
        setEditError(result.error);
        return;
      }
      setEditing(false);
    });
  }

  function cancelEdit() {
    setDraft({ firstName: user.firstName, lastName: user.lastName, email: user.email });
    setEditError(null);
    setEditing(false);
  }

  function handleDelete() {
    if (!window.confirm(`Supprimer définitivement le compte de ${user.firstName} ${user.lastName} ? Cette action est irréversible.`)) return;
    startTransition(async () => {
      setDeleteError(null);
      const result = await deleteUserAction(user.id);
      if (!result.ok) setDeleteError(result.error);
    });
  }

  function togglePermission(key: PermissionKey) {
    const next = user.permissions.includes(key)
      ? user.permissions.filter((permission) => permission !== key)
      : [...user.permissions, key];
    startTransition(() => setUserPermissions(user.id, next as PermissionKey[]));
  }

  return (
    <>
      <tr className={pending ? "opacity-50" : ""}>
        <td className="px-3 py-3">
          {editing ? (
            <div className="grid gap-1.5">
              <div className="flex gap-1.5">
                <input value={draft.firstName} onChange={(event) => setDraft((current) => ({ ...current, firstName: event.target.value }))} placeholder="Prénom" className="h-9 w-1/2 rounded-lg border border-[#d9e5e2] bg-white px-2 text-xs font-bold text-animeo-dark" />
                <input value={draft.lastName} onChange={(event) => setDraft((current) => ({ ...current, lastName: event.target.value }))} placeholder="Nom" className="h-9 w-1/2 rounded-lg border border-[#d9e5e2] bg-white px-2 text-xs font-bold text-animeo-dark" />
              </div>
              <input type="email" value={draft.email} onChange={(event) => setDraft((current) => ({ ...current, email: event.target.value }))} placeholder="Email" className="h-9 rounded-lg border border-[#d9e5e2] bg-white px-2 text-xs font-bold text-animeo-dark" />
            </div>
          ) : (
            <>
              <p className="font-extrabold text-animeo-dark">{user.firstName} {user.lastName}{isSelf ? <span className="ml-1.5 text-[10px] font-black uppercase text-animeo-muted">(vous)</span> : null}</p>
              <p className="text-xs text-animeo-muted">{user.email}</p>
            </>
          )}
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
            disabled={pending || isSelf}
            title={isSelf ? "Vous ne pouvez pas désactiver votre propre compte" : undefined}
            onClick={() => startTransition(() => setUserActive(user.id, !user.active))}
            className={`rounded-full px-3 py-1 text-[11px] font-black disabled:cursor-not-allowed disabled:opacity-60 ${user.active ? "bg-[#e4f5ef] text-[#267668]" : "bg-[#fff1f1] text-animeo-error"}`}
          >
            {user.active ? "Actif" : "Désactivé"}
          </button>
        </td>
        <td className="px-3 py-3 text-xs font-semibold text-animeo-muted">
          {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" }) : "Jamais"}
        </td>
        <td className="px-3 py-3">
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            {editing ? (
              <>
                <button type="button" disabled={pending} onClick={saveEdit} className="rounded-lg bg-animeo px-2.5 py-1.5 text-[11px] font-extrabold text-white">Enregistrer</button>
                <button type="button" disabled={pending} onClick={cancelEdit} className="rounded-lg bg-animeo-bg px-2.5 py-1.5 text-[11px] font-extrabold text-animeo-muted">Annuler</button>
              </>
            ) : (
              <button type="button" onClick={() => setEditing(true)} className="rounded-lg bg-animeo-bg px-2.5 py-1.5 text-[11px] font-extrabold text-animeo-dark hover:bg-animeo-soft">Modifier</button>
            )}
            <button type="button" onClick={() => setManagingPermissions((current) => !current)} className="rounded-lg bg-animeo-bg px-2.5 py-1.5 text-[11px] font-extrabold text-animeo-dark hover:bg-animeo-soft">Permissions</button>
            <button type="button" disabled={pending || isSelf} title={isSelf ? "Vous ne pouvez pas supprimer votre propre compte" : undefined} onClick={handleDelete} className="rounded-lg bg-[#fff1f1] px-2.5 py-1.5 text-[11px] font-extrabold text-animeo-error disabled:cursor-not-allowed disabled:opacity-60 hover:bg-[#ffe0e0]">Supprimer</button>
          </div>
        </td>
      </tr>
      {editError ? (
        <tr><td colSpan={6} className="px-3 pb-2"><p role="alert" className="rounded-lg bg-[#fff1f1] px-3 py-2 text-xs font-bold text-animeo-error">{editError}</p></td></tr>
      ) : null}
      {deleteError ? (
        <tr><td colSpan={6} className="px-3 pb-2"><p role="alert" className="rounded-lg bg-[#fff1f1] px-3 py-2 text-xs font-bold text-animeo-error">{deleteError}</p></td></tr>
      ) : null}
      {managingPermissions ? (
        <tr>
          <td colSpan={6} className="px-3 pb-4">
            <div className="rounded-2xl border border-[#e3ece9] bg-animeo-bg p-4">
              {user.role === "ADMIN" ? (
                <p className="text-xs font-bold text-animeo-muted">Ce compte est administrateur : il dispose déjà de toutes les permissions.</p>
              ) : (
                <>
                  <p className="mb-3 text-[11px] font-extrabold uppercase tracking-[0.1em] text-animeo-muted">Permissions supplémentaires</p>
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {permissionKeys.map((key) => (
                      <label key={key} className="flex items-center gap-2 rounded-xl bg-white px-3 py-2.5 text-xs font-bold text-animeo-dark">
                        <input type="checkbox" checked={user.permissions.includes(key)} disabled={pending} onChange={() => togglePermission(key)} className="h-4 w-4 accent-[#4FAF9F]" />
                        {permissionLabels[key]}
                      </label>
                    ))}
                  </div>
                </>
              )}
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}
