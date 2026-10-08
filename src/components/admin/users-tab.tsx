"use client";

import { useActionState, useState, useTransition } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Toggle } from "@/components/settings/settings-fields";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { IconButton } from "@/components/ui/icon-button";
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
import { useCurrentUser } from "@/components/auth/current-user-provider";
import { hasModule, moduleClosedMessage } from "@/lib/modules";

const inputClassName = "h-11 w-full rounded-[12px] border border-animeo-border bg-animeo-bg px-3 text-sm font-semibold text-animeo-dark outline-none transition focus:border-animeo focus:bg-white";

export function UsersTab({ users, currentUserId }: { users: AdminUser[]; currentUserId: string }) {
  const [state, action, pending] = useActionState<CreateUserState, FormData>(createUser, undefined);
  const [showForm, setShowForm] = useState(false);
  // Ajouter des collègues est un module (src/lib/modules.ts).
  const canAddAccounts = hasModule(useCurrentUser()?.modules, "TEAM");

  return (
    <div className="space-y-6">
      <Card className="p-5 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-extrabold text-animeo-dark">Comptes de l’équipe</h2>
            <p className="mt-1 text-sm text-animeo-muted">{users.length} compte{users.length > 1 ? "s" : ""}</p>
          </div>
          {canAddAccounts ? (
            showForm
              ? <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>Annuler</Button>
              : <Button type="button" onClick={() => setShowForm(true)} icon={<Plus aria-hidden="true" className="h-4 w-4" strokeWidth={2.75} />}>Nouveau compte</Button>
          ) : null}
        </div>

        {!canAddAccounts ? (
          <p className="mb-4 rounded-xl bg-animeo-bg px-4 py-3 text-sm text-animeo-muted">{moduleClosedMessage("TEAM")}</p>
        ) : null}

        {showForm && canAddAccounts ? (
          <form action={action} className="mb-6 grid gap-3 rounded-2xl border border-animeo-border-soft bg-animeo-bg p-4 sm:grid-cols-2 xl:grid-cols-5">
            <label className="block">
              <span className="mb-1 block text-xs font-extrabold uppercase tracking-[0.1em] text-animeo-muted">Prénom</span>
              <input name="firstName" required className={inputClassName} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-extrabold uppercase tracking-[0.1em] text-animeo-muted">Nom</span>
              <input name="lastName" required className={inputClassName} />
            </label>
            <label className="block xl:col-span-2">
              <span className="mb-1 block text-xs font-extrabold uppercase tracking-[0.1em] text-animeo-muted">Email</span>
              <input type="email" name="email" required className={inputClassName} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-extrabold uppercase tracking-[0.1em] text-animeo-muted">Rôle</span>
              <select name="role" defaultValue="PRACTITIONER" className={inputClassName}>
                <option value="ADMIN">Administrateur</option>
                <option value="PRACTITIONER">Praticien</option>
                <option value="SECRETARY">Secrétariat</option>
              </select>
            </label>
            <div className="sm:col-span-2 xl:col-span-5">
              <Button type="submit" disabled={pending}>{pending ? "Création…" : "Créer le compte"}</Button>
            </div>

            {state?.error ? <p role="alert" className="sm:col-span-2 xl:col-span-5 rounded-[12px] bg-animeo-danger-soft px-4 py-3 text-sm font-bold text-animeo-danger">{state.error}</p> : null}
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
          <table className="w-full min-w-[980px] border-collapse text-left">
            <thead className="text-xs font-extrabold uppercase tracking-[0.1em] text-animeo-muted">
              <tr>
                <th className="px-3 py-2.5">Compte</th>
                <th className="px-3 py-2.5">Rôle</th>
                <th className="px-3 py-2.5">2FA email</th>
                <th className="px-3 py-2.5">Statut</th>
                <th className="px-3 py-2.5">Dernière connexion</th>
                <th className="px-3 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-animeo-border-soft">
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
  const [confirming, setConfirming] = useState<"deactivate" | "delete" | null>(null);
  const fullName = `${user.firstName} ${user.lastName}`;

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
    setConfirming(null);
    startTransition(async () => {
      setDeleteError(null);
      const result = await deleteUserAction(user.id);
      if (!result.ok) setDeleteError(result.error);
    });
  }

  /** Désactiver coupe l'accès de quelqu'un : confirmé. Réactiver ne coupe rien : immédiat. */
  function changeActive(active: boolean) {
    if (!active) { setConfirming("deactivate"); return; }
    startTransition(() => setUserActive(user.id, true));
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
                <input value={draft.firstName} onChange={(event) => setDraft((current) => ({ ...current, firstName: event.target.value }))} placeholder="Prénom" className="h-9 w-1/2 rounded-lg border border-animeo-border bg-white px-2 text-xs font-bold text-animeo-dark" />
                <input value={draft.lastName} onChange={(event) => setDraft((current) => ({ ...current, lastName: event.target.value }))} placeholder="Nom" className="h-9 w-1/2 rounded-lg border border-animeo-border bg-white px-2 text-xs font-bold text-animeo-dark" />
              </div>
              <input type="email" value={draft.email} onChange={(event) => setDraft((current) => ({ ...current, email: event.target.value }))} placeholder="Email" className="h-9 rounded-lg border border-animeo-border bg-white px-2 text-xs font-bold text-animeo-dark" />
            </div>
          ) : (
            <>
              <p className="font-extrabold text-animeo-dark">{user.firstName} {user.lastName}{isSelf ? <span className="ml-1.5 text-xs font-black uppercase text-animeo-muted">(vous)</span> : null}</p>
              <p className="text-xs text-animeo-muted">{user.email}</p>
            </>
          )}
        </td>
        <td className="px-3 py-3">
          <select
            defaultValue={user.role}
            disabled={pending}
            onChange={(event) => startTransition(() => setUserRole(user.id, event.target.value as AdminUser["role"]))}
            className="rounded-lg border border-animeo-border bg-white px-2 py-1.5 text-xs font-bold text-animeo-dark"
          >
            {Object.entries(roleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </td>
        <td className="px-3 py-3">
          <Toggle
            compact
            checked={user.twoFactorEnabled}
            disabled={pending}
            onChange={(enabled) => startTransition(() => setUserTwoFactor(user.id, enabled))}
            label={user.twoFactorEnabled ? "Activée" : "Désactivée"}
            ariaLabel={`Double authentification par e-mail de ${fullName}`}
          />
        </td>
        <td className="px-3 py-3">
          {/* Son propre compte : l'interrupteur reste éteint à la main, et dit pourquoi. */}
          <span title={isSelf ? "Vous ne pouvez pas désactiver votre propre compte" : undefined} className="inline-flex">
            <Toggle compact checked={user.active} disabled={pending || isSelf} onChange={changeActive} label={user.active ? "Actif" : "Désactivé"} ariaLabel={`Compte de ${fullName} actif`} />
          </span>
        </td>
        <td className="px-3 py-3 text-xs font-semibold text-animeo-muted">
          {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" }) : "Jamais"}
        </td>
        <td className="px-3 py-3">
          <div className="flex items-center justify-end gap-2">
            {editing ? (
              <>
                <Button type="button" disabled={pending} onClick={saveEdit}>Enregistrer</Button>
                <Button type="button" variant="secondary" disabled={pending} onClick={cancelEdit}>Annuler</Button>
              </>
            ) : (
              <Button type="button" variant="secondary" onClick={() => setEditing(true)} icon={<Pencil aria-hidden="true" className="h-4 w-4" />}>Modifier</Button>
            )}
            <Button type="button" variant="secondary" active={managingPermissions} aria-expanded={managingPermissions} onClick={() => setManagingPermissions((current) => !current)}>Permissions</Button>
            <IconButton variant="danger" label={isSelf ? "Vous ne pouvez pas supprimer votre propre compte" : `Supprimer le compte de ${fullName}`} disabled={pending || isSelf} onClick={() => setConfirming("delete")} tooltipAlign="end">
              <Trash2 aria-hidden="true" className="h-5 w-5" />
            </IconButton>
          </div>
          {confirming === "deactivate" ? (
            <ConfirmModal
              title={`Désactiver le compte de ${fullName} ?`}
              message="Cette personne ne pourra plus se connecter."
              confirmLabel="Désactiver"
              onConfirm={() => { setConfirming(null); startTransition(() => setUserActive(user.id, false)); }}
              onClose={() => setConfirming(null)}
            />
          ) : null}
          {confirming === "delete" ? (
            <ConfirmModal
              title="Supprimer ce compte ?"
              message={`Supprimer définitivement le compte de ${fullName} ? Cette action est irréversible.`}
              confirmLabel="Supprimer"
              onConfirm={handleDelete}
              onClose={() => setConfirming(null)}
            />
          ) : null}
        </td>
      </tr>
      {editError ? (
        <tr><td colSpan={6} className="px-3 pb-2"><p role="alert" className="rounded-lg bg-animeo-danger-soft px-3 py-2 text-xs font-bold text-animeo-danger">{editError}</p></td></tr>
      ) : null}
      {deleteError ? (
        <tr><td colSpan={6} className="px-3 pb-2"><p role="alert" className="rounded-lg bg-animeo-danger-soft px-3 py-2 text-xs font-bold text-animeo-danger">{deleteError}</p></td></tr>
      ) : null}
      {managingPermissions ? (
        <tr>
          <td colSpan={6} className="px-3 pb-4">
            <div className="rounded-2xl border border-animeo-border-soft bg-animeo-bg p-4">
              {user.role === "ADMIN" ? (
                <p className="text-xs font-bold text-animeo-muted">Ce compte est administrateur : il dispose déjà de toutes les permissions.</p>
              ) : (
                <>
                  <p className="mb-3 text-xs font-extrabold uppercase tracking-[0.1em] text-animeo-muted">Permissions supplémentaires</p>
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {permissionKeys.map((key) => (
                      <label key={key} className="flex items-center gap-2 rounded-xl bg-white px-3 py-2.5 text-xs font-bold text-animeo-dark">
                        <input type="checkbox" checked={user.permissions.includes(key)} disabled={pending} onChange={() => togglePermission(key)} className="h-4 w-4 accent-animeo-brand" />
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
