"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/ui/card";
import { startAssistanceAction } from "@/lib/platform/assistance-actions";
import { roleLabels } from "@/data/admin";

export type PlatformAccountView = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: "ADMIN" | "PRACTITIONER" | "SECRETARY";
  active: boolean;
  platformAdmin: boolean;
  lastLoginAt: string | null;
};

export type PlatformOrganizationView = {
  id: string;
  name: string;
  createdAt: string;
  slug: string | null;
  counts: { clients: number; appointments: number };
  accounts: PlatformAccountView[];
};

export type PlatformAssistanceView = {
  id: string;
  action: "ASSISTANCE_STARTED" | "ASSISTANCE_ENDED";
  createdAt: string;
  organizationName: string | null;
  assistedName: string | null;
  impersonatorName: string | null;
  reason: string;
};

const dateFormatter = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" });

/**
 * Super-administration : retrouver un cabinet et le compte à aider, puis
 * l'assister. Ce qui est affiché ici se limite à ce qu'il faut pour choisir —
 * jamais le contenu d'un cabinet, qui ne s'ouvre qu'en l'assistant, motif à
 * l'appui.
 */
export function PlatformView({ organizations, assistances }: { organizations: PlatformOrganizationView[]; assistances: PlatformAssistanceView[] }) {
  return (
    <div className="space-y-6">
      {organizations.map((organization) => (
        <Card key={organization.id} className="p-5 sm:p-6">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-extrabold text-animeo-dark">{organization.name}</h2>
              <p className="mt-1 text-sm text-animeo-muted">
                {organization.slug ? `/reserver/${organization.slug} · ` : ""}
                {organization.counts.clients} client{organization.counts.clients > 1 ? "s" : ""} · {organization.counts.appointments} rendez-vous · créé le {dateFormatter.format(new Date(organization.createdAt))}
              </p>
            </div>
          </div>

          {organization.accounts.length === 0 ? (
            <p className="text-sm text-animeo-muted">Aucun compte dans ce cabinet.</p>
          ) : (
            <ul className="divide-y divide-animeo-border-soft">
              {organization.accounts.map((account) => <AccountRow key={account.id} account={account} />)}
            </ul>
          )}
        </Card>
      ))}

      <Card className="p-5 sm:p-6">
        <h2 className="text-lg font-extrabold text-animeo-dark">Dernières assistances</h2>
        <p className="mt-1 text-sm text-animeo-muted">Chaque ouverture et chaque fin est aussi inscrite au journal du cabinet concerné.</p>
        {assistances.length === 0 ? (
          <p className="mt-4 text-sm text-animeo-muted">Aucune assistance pour l’instant.</p>
        ) : (
          <ul className="mt-4 divide-y divide-animeo-border-soft">
            {assistances.map((entry) => (
              <li key={entry.id} className="py-3 text-sm">
                <p className="font-bold text-animeo-dark">
                  {entry.action === "ASSISTANCE_STARTED" ? "Ouverte" : "Terminée"} · {entry.organizationName ?? "—"} · {entry.assistedName ?? "—"}
                </p>
                <p className="text-animeo-muted">
                  {dateFormatter.format(new Date(entry.createdAt))} par {entry.impersonatorName ?? "—"}
                  {entry.reason ? ` — « ${entry.reason} »` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function AccountRow({ account }: { account: PlatformAccountView }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const reasonId = `assistance-reason-${account.id}`;
  const canAssist = account.active && !account.platformAdmin;

  function submit() {
    setError(null);
    startTransition(async () => {
      // En cas de succès, l'action redirige vers l'espace du professionnel ;
      // on ne revient ici qu'avec un refus.
      const result = await startAssistanceAction(account.id, reason);
      if (result && !result.ok) setError(result.error);
    });
  }

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-bold text-animeo-dark">
            {account.firstName} {account.lastName}
            <span className="ml-2 text-xs font-extrabold text-animeo-muted">{roleLabels[account.role]}{account.platformAdmin ? " · plateforme" : ""}{account.active ? "" : " · désactivé"}</span>
          </p>
          <p className="truncate text-sm text-animeo-muted">
            {account.email} · {account.lastLoginAt ? `dernière connexion le ${dateFormatter.format(new Date(account.lastLoginAt))}` : "jamais connecté"}
          </p>
        </div>
        {canAssist ? (
          <button
            type="button"
            onClick={() => setOpen((current) => !current)}
            aria-expanded={open}
            className="rounded-xl border border-animeo-border px-3 py-2 text-sm font-extrabold text-animeo-dark transition hover:bg-animeo-soft"
          >
            {open ? "Annuler" : "Assister"}
          </button>
        ) : null}
      </div>

      {open ? (
        <div className="mt-3 rounded-2xl border border-animeo-border-soft bg-animeo-bg p-4">
          <label htmlFor={reasonId} className="mb-1 block text-[11px] font-extrabold uppercase tracking-[0.1em] text-animeo-muted">
            Motif de l’assistance
          </label>
          <textarea
            id={reasonId}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={2}
            maxLength={500}
            placeholder="Ex. : demande par téléphone du 23/09, rendez-vous qui ne s’affichent plus"
            className="w-full rounded-[12px] border border-animeo-border bg-white px-3 py-2 text-sm text-animeo-dark outline-none focus:border-animeo"
          />
          <p className="mt-2 text-xs text-animeo-muted">
            Vous agirez dans l’espace de {account.firstName} pendant 30 minutes au plus. Le motif et chacune de vos actions seront inscrits au journal de son cabinet.
          </p>
          {error ? <p role="alert" className="mt-2 text-sm font-bold text-animeo-danger">{error}</p> : null}
          <button
            type="button"
            onClick={submit}
            disabled={pending}
            className="mt-3 rounded-xl bg-animeo-dark px-4 py-2.5 text-sm font-extrabold text-white transition hover:bg-animeo-deep disabled:opacity-70"
          >
            {pending ? "Ouverture…" : `Ouvrir l’assistance de ${account.firstName}`}
          </button>
        </div>
      ) : null}
    </li>
  );
}
