"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Card } from "@/components/ui/card";
import { createInvitationAction, revokeInvitationAction } from "@/lib/platform/invitation-actions";

export type PlatformInvitationView = {
  id: string;
  email: string;
  organizationName: string;
  createdAt: string;
  expiresAt: string;
  status: "pending" | "used" | "revoked" | "expired";
  createdByName: string | null;
};

const statusLabels: Record<PlatformInvitationView["status"], string> = {
  pending: "En attente",
  used: "Espace ouvert",
  revoked: "Annulée",
  expired: "Expirée",
};

const dateFormatter = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" });
const inputClassName = "h-11 w-full rounded-[12px] border border-animeo-border bg-white px-3 text-sm text-animeo-dark outline-none focus:border-animeo";
const labelClassName = "mb-1 block text-[11px] font-extrabold uppercase tracking-[0.1em] text-animeo-muted";

/**
 * Inviter un professionnel à ouvrir son cabinet. L'inscription n'est pas
 * publique : c'est d'ici, et seulement d'ici, qu'un cabinet peut naître.
 *
 * Le lien est montré une fois, après l'envoi, pour pouvoir le transmettre
 * autrement si l'e-mail n'arrive pas. Il n'est gardé nulle part en clair :
 * perdu, il suffit d'inviter à nouveau, ce qui annule le précédent.
 */
export function InvitationsPanel({ invitations }: { invitations: PlatformInvitationView[] }) {
  const [email, setEmail] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ email: string; url: string; emailSent: boolean } | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSent(null);
    setCopied(false);
    startTransition(async () => {
      const result = await createInvitationAction({ email, organizationName });
      if (!result.ok) return setError(result.error);
      setSent({ email: email.trim().toLowerCase(), url: result.url, emailSent: result.emailSent });
      setEmail("");
      setOrganizationName("");
    });
  }

  function revoke(id: string) {
    startTransition(async () => {
      const result = await revokeInvitationAction(id);
      if (!result.ok) setError(result.error);
    });
  }

  async function copy(url: string) {
    await navigator.clipboard.writeText(url);
    setCopied(true);
  }

  return (
    <Card className="p-5 sm:p-6">
      <h2 className="text-lg font-extrabold text-animeo-dark">Inviter un professionnel</h2>
      <p className="mt-1 text-sm text-animeo-muted">Il reçoit un lien, valable 7 jours, pour créer son compte et ouvrir son espace. Inviter à nouveau la même adresse annule le lien précédent.</p>

      <form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div>
          <label htmlFor="invitation-email" className={labelClassName}>Adresse e-mail</label>
          <input id="invitation-email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} className={inputClassName} autoComplete="off" />
        </div>
        <div>
          <label htmlFor="invitation-organization" className={labelClassName}>Nom de l’activité</label>
          <input id="invitation-organization" required value={organizationName} onChange={(event) => setOrganizationName(event.target.value)} className={inputClassName} placeholder="Modifiable par l’invité" />
        </div>
        <button type="submit" disabled={pending} className="h-11 rounded-xl bg-animeo-dark px-4 text-sm font-extrabold text-white transition hover:bg-animeo-deep disabled:opacity-70">
          {pending ? "Envoi…" : "Envoyer l’invitation"}
        </button>
      </form>

      {error ? <p role="alert" className="mt-3 text-sm font-bold text-animeo-danger">{error}</p> : null}

      {sent ? (
        <div role="status" className="mt-4 rounded-2xl border border-animeo-border-soft bg-animeo-bg p-4 text-sm">
          <p className="font-bold text-animeo-dark">
            {sent.emailSent ? `Invitation envoyée à ${sent.email}.` : `L’e-mail n’a pas pu partir : transmettez ce lien à ${sent.email} vous-même.`}
          </p>
          <p className="mt-1 text-animeo-muted">Lien d’invitation — affiché cette fois seulement :</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code data-testid="invitation-url" className="min-w-0 flex-1 break-all rounded-lg bg-white px-3 py-2 text-xs text-animeo-dark">{sent.url}</code>
            <button type="button" onClick={() => copy(sent.url)} className="rounded-xl border border-animeo-border px-3 py-2 text-sm font-extrabold text-animeo-dark hover:bg-animeo-soft">
              {copied ? "Copié" : "Copier"}
            </button>
          </div>
        </div>
      ) : null}

      {invitations.length > 0 ? (
        <ul aria-label="Invitations" className="mt-5 divide-y divide-animeo-border-soft">
          {invitations.map((invitation) => (
            <li key={invitation.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
              <div className="min-w-0">
                <p className="font-bold text-animeo-dark">{invitation.email} · {invitation.organizationName}</p>
                <p className="text-animeo-muted">
                  {statusLabels[invitation.status]} · envoyée le {dateFormatter.format(new Date(invitation.createdAt))}
                  {invitation.createdByName ? ` par ${invitation.createdByName}` : ""}
                  {invitation.status === "pending" ? ` · valable jusqu’au ${dateFormatter.format(new Date(invitation.expiresAt))}` : ""}
                </p>
              </div>
              {invitation.status === "pending" ? (
                <button type="button" onClick={() => revoke(invitation.id)} disabled={pending} className="rounded-xl border border-animeo-border px-3 py-2 text-sm font-extrabold text-animeo-dark hover:bg-animeo-soft" aria-label={`Annuler l’invitation de ${invitation.email}`}>
                  Annuler
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}
