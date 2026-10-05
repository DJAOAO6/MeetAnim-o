"use client";

import { useState, useTransition } from "react";
import { cancelOrganizationDeletionAction, reactivateOrganizationAction, suspendOrganizationAction } from "@/lib/platform/organization-actions";
import { OrganizationDeletionDialog } from "@/components/platform/organization-deletion-dialog";

const dateFormatter = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" });

/**
 * Statut d'un espace et ses actions : suspendre (motif obligatoire, inscrit
 * au journal), réactiver, supprimer (programmé à 7 jours ou immédiat) et
 * annuler une suppression programmée.
 */
export function OrganizationStatusControls({ organizationId, organizationName, suspendedAt, suspendedReason, deletionScheduledFor, ownSpace }: {
  organizationId: string;
  organizationName: string;
  suspendedAt: string | null;
  suspendedReason: string | null;
  deletionScheduledFor: string | null;
  /** L'espace du compte de plateforme lui-même : on ne s'y coupe pas. */
  ownSpace: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const reasonId = `suspend-reason-${organizationId}`;

  function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) return setError(result.error);
      setOpen(false);
      setReason("");
    });
  }

  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      {deletionScheduledFor ? (
        <span className="rounded-full bg-animeo-danger-soft px-2.5 py-1 text-xs font-extrabold text-animeo-error">Suppression prévue le {dateFormatter.format(new Date(deletionScheduledFor))}</span>
      ) : suspendedAt ? (
        <span className="rounded-full bg-animeo-warning-soft px-2.5 py-1 text-xs font-extrabold text-animeo-dark" title={suspendedReason ?? undefined}>Suspendu depuis le {dateFormatter.format(new Date(suspendedAt))}</span>
      ) : (
        <span className="rounded-full bg-animeo-positive-soft px-2.5 py-1 text-xs font-extrabold text-animeo-dark">Actif</span>
      )}

      {deletionScheduledFor ? (
        <button type="button" onClick={() => run(() => cancelOrganizationDeletionAction(organizationId))} disabled={pending} className="min-h-9 rounded-xl border border-animeo-border px-3 text-xs font-extrabold text-animeo-dark hover:bg-animeo-soft disabled:opacity-50">
          {pending ? "Annulation…" : "Annuler la suppression"}
        </button>
      ) : null}

      {suspendedAt && !deletionScheduledFor ? (
        <button type="button" onClick={() => run(() => reactivateOrganizationAction(organizationId))} disabled={pending} className="min-h-9 rounded-xl border border-animeo-border px-3 text-xs font-extrabold text-animeo-dark hover:bg-animeo-soft disabled:opacity-50">
          {pending ? "Réactivation…" : "Réactiver"}
        </button>
      ) : null}

      {!suspendedAt && !ownSpace ? (
        open ? (
          <div className="w-full max-w-sm rounded-xl border border-animeo-border bg-white p-3 text-left">
            <label htmlFor={reasonId} className="block text-xs font-extrabold text-animeo-dark">Motif de la suspension</label>
            <p className="text-xs text-animeo-muted">Inscrit au journal. Le professionnel n’en voit rien : il lit seulement « compte suspendu ».</p>
            <textarea id={reasonId} value={reason} onChange={(event) => setReason(event.target.value)} rows={2} maxLength={300} className="mt-2 w-full rounded-lg border border-animeo-border px-2 py-1.5 text-sm" />
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" onClick={() => run(() => suspendOrganizationAction(organizationId, reason))} disabled={pending} className="min-h-9 rounded-xl bg-animeo-error px-3 text-xs font-extrabold text-white disabled:opacity-50">
                {pending ? "Suspension…" : `Suspendre ${organizationName}`}
              </button>
              <button type="button" onClick={() => { setOpen(false); setError(null); }} disabled={pending} className="min-h-9 rounded-xl px-3 text-xs font-extrabold text-animeo-muted">Annuler</button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setOpen(true)} className="min-h-9 rounded-xl border border-animeo-border px-3 text-xs font-extrabold text-animeo-error hover:bg-animeo-danger-soft">
            Suspendre…
          </button>
        )
      ) : null}

      {!deletionScheduledFor && !ownSpace ? (
        <button type="button" onClick={() => setDeleting(true)} className="min-h-9 rounded-xl px-3 text-xs font-extrabold text-animeo-error hover:bg-animeo-danger-soft">
          Supprimer l’espace…
        </button>
      ) : null}

      {error ? <p role="alert" className="text-xs font-bold text-animeo-error">{error}</p> : null}
      {deleting ? <OrganizationDeletionDialog organizationId={organizationId} organizationName={organizationName} onClose={() => setDeleting(false)} /> : null}
    </div>
  );
}
