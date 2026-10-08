"use client";

import { useState, useTransition } from "react";
import { approveVerificationAction, rejectVerificationAction } from "@/lib/platform/verification-actions";
import { Button } from "@/components/ui/button";

/** Annuaire public où le numéro se contrôle à la main. */
const RNA_DIRECTORY_URL = "https://www.veterinaire.fr/annuaires/liste-des-personnes-non-veterinaires-pouvant-realiser-des-actes-dosteopathie-animale/registre-national-daptitude-rna";

const dateFormatter = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" });

export type PlatformVerificationView = {
  status: "NOT_REQUIRED" | "PENDING" | "VERIFIED" | "REJECTED";
  requestedAt: string | null;
  note: string | null;
  profession: string;
  registrationNumber: string | null;
};

/**
 * Vérification du numéro RNA d'un espace (chantier C4) : le métier, le
 * numéro, la date de la demande et l'annuaire où le contrôler ; puis
 * Valider, ou Refuser avec un motif montré au professionnel.
 */
export function VerificationReview({ organizationId, organizationName, verification }: { organizationId: string; organizationName: string; verification: PlatformVerificationView }) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const reasonId = `verification-reason-${organizationId}`;

  if (verification.status === "REJECTED") {
    return (
      <p className="mb-4 rounded-2xl border border-animeo-border-soft bg-animeo-bg px-4 py-3 text-sm text-animeo-dark">
        <span className="font-extrabold">Numéro RNA refusé</span>
        {verification.registrationNumber ? ` (${verification.registrationNumber})` : ""} — en attente d’une correction du professionnel.
        {verification.note ? <span className="mt-1 block text-animeo-muted">Motif : « {verification.note} »</span> : null}
      </p>
    );
  }
  if (verification.status !== "PENDING") return null;

  function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <section aria-label={`Vérification du numéro RNA de ${organizationName}`} className="mb-4 rounded-2xl border border-animeo-warning-border bg-animeo-warning-soft p-4">
      <dl className="grid gap-x-6 gap-y-1 text-sm text-animeo-dark sm:grid-cols-[auto_1fr]">
        <dt className="font-bold text-animeo-muted">Métier</dt>
        <dd>{verification.profession || "—"}</dd>
        <dt className="font-bold text-animeo-muted">Numéro RNA</dt>
        <dd className="font-extrabold">{verification.registrationNumber ?? "—"}</dd>
        <dt className="font-bold text-animeo-muted">Demande</dt>
        <dd>{verification.requestedAt ? dateFormatter.format(new Date(verification.requestedAt)) : "—"}</dd>
      </dl>
      <p className="mt-3 text-sm">
        <a href={RNA_DIRECTORY_URL} target="_blank" rel="noopener noreferrer" className="font-bold text-animeo-dark underline">
          Contrôler dans l’annuaire de l’Ordre des vétérinaires<span className="sr-only"> (nouvel onglet)</span>
        </a>
      </p>

      {rejecting ? (
        <div className="mt-3">
          <label htmlFor={reasonId} className="mb-1 block text-xs font-extrabold uppercase tracking-[0.1em] text-animeo-muted">Motif du refus</label>
          <textarea
            id={reasonId}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={2}
            maxLength={500}
            placeholder="Ex. : numéro introuvable dans l’annuaire de l’Ordre"
            className="w-full rounded-[12px] border border-animeo-border bg-white px-3 py-2 text-sm text-animeo-dark outline-none focus:border-animeo"
          />
          <p className="mt-1 text-xs text-animeo-muted">Il sera montré au professionnel, qui pourra corriger son numéro.</p>
        </div>
      ) : null}

      {error ? <p role="alert" className="mt-2 text-sm font-bold text-animeo-danger">{error}</p> : null}

      <div className="mt-3 flex flex-wrap gap-2">
        {rejecting ? (
          <>
            <Button type="button" variant="dangerSolid" onClick={() => run(() => rejectVerificationAction(organizationId, reason))} disabled={pending}>
              {pending ? "Envoi…" : "Confirmer le refus"}
            </Button>
            <Button type="button" variant="secondary" onClick={() => { setRejecting(false); setError(null); }} disabled={pending}>Annuler</Button>
          </>
        ) : (
          <>
            <Button type="button" onClick={() => run(() => approveVerificationAction(organizationId))} disabled={pending}>
              {pending ? "Validation…" : "Valider le numéro"}
            </Button>
            <Button type="button" variant="danger" onClick={() => setRejecting(true)} disabled={pending}>Refuser</Button>
          </>
        )}
      </div>
    </section>
  );
}
