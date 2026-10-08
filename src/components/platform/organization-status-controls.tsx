"use client";

import { useState, useTransition } from "react";
import { cancelOrganizationDeletionAction, reactivateOrganizationAction, suspendOrganizationAction } from "@/lib/platform/organization-actions";
import { OrganizationDeletionDialog } from "@/components/platform/organization-deletion-dialog";
import { Button } from "@/components/ui/button";

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
        <span className="rounded-full bg-animeo-danger-soft px-2.5 py-1 text-xs font-extrabold text-animeo-danger">Suppression prévue le {dateFormatter.format(new Date(deletionScheduledFor))}</span>
      ) : suspendedAt ? (
        <span className="rounded-full bg-animeo-warning-soft px-2.5 py-1 text-xs font-extrabold text-animeo-dark" title={suspendedReason ?? undefined}>Suspendu depuis le {dateFormatter.format(new Date(suspendedAt))}</span>
      ) : (
        <span className="rounded-full bg-animeo-positive-soft px-2.5 py-1 text-xs font-extrabold text-animeo-dark">Actif</span>
      )}

      {deletionScheduledFor ? (
        <Button type="button" variant="secondary" onClick={() => run(() => cancelOrganizationDeletionAction(organizationId))} disabled={pending}>
          {pending ? "Annulation…" : "Annuler la suppression"}
        </Button>
      ) : null}

      {suspendedAt && !deletionScheduledFor ? (
        <Button type="button" variant="secondary" onClick={() => run(() => reactivateOrganizationAction(organizationId))} disabled={pending}>
          {pending ? "Réactivation…" : "Réactiver"}
        </Button>
      ) : null}

      {!suspendedAt && !ownSpace ? (
        open ? (
          <div className="w-full max-w-sm rounded-xl border border-animeo-border bg-white p-3 text-left">
            <label htmlFor={reasonId} className="block text-xs font-extrabold text-animeo-dark">Motif de la suspension</label>
            <p className="text-xs text-animeo-muted">Inscrit au journal. Le professionnel n’en voit rien : il lit seulement « compte suspendu ».</p>
            <textarea id={reasonId} value={reason} onChange={(event) => setReason(event.target.value)} rows={2} maxLength={300} className="mt-2 w-full rounded-lg border border-animeo-border px-2 py-1.5 text-sm" />
            <div className="mt-2 flex flex-wrap gap-2">
              <Button type="button" variant="dangerSolid" onClick={() => run(() => suspendOrganizationAction(organizationId, reason))} disabled={pending}>
                {pending ? "Suspension…" : `Suspendre ${organizationName}`}
              </Button>
              <Button type="button" variant="secondary" onClick={() => { setOpen(false); setError(null); }} disabled={pending}>Annuler</Button>
            </div>
          </div>
        ) : (
          <Button type="button" variant="danger" onClick={() => setOpen(true)}>
            Suspendre…
          </Button>
        )
      ) : null}

      {!deletionScheduledFor && !ownSpace ? (
        <Button type="button" variant="danger" onClick={() => setDeleting(true)}>
          Supprimer l’espace…
        </Button>
      ) : null}

      {error ? <p role="alert" className="text-xs font-bold text-animeo-danger">{error}</p> : null}
      {deleting ? <OrganizationDeletionDialog organizationId={organizationId} organizationName={organizationName} onClose={() => setDeleting(false)} /> : null}
    </div>
  );
}
