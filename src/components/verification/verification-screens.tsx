"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { inputClassName } from "@/components/settings/settings-fields";
import { resubmitVerificationAction } from "@/lib/verification-actions";

/**
 * Écrans d'un espace qui attend la vérification de son numéro RNA
 * (chantier C4) : en cours, ou refusé avec son motif et la possibilité de
 * corriger le numéro.
 */

function useFocusedHeading() {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => headingRef.current?.focus(), []);
  return headingRef;
}

export function VerificationPending({ registrationNumber }: { registrationNumber: string | null }) {
  const headingRef = useFocusedHeading();
  return (
    <Card className="mx-auto max-w-2xl p-5 sm:p-8">
      <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-black text-animeo-dark outline-none">Vérification de votre numéro RNA en cours</h1>
      <p className="mt-2 text-sm text-animeo-muted">
        Votre espace est configuré. Il s’ouvrira, avec votre page de rendez-vous, dès la validation de votre numéro, généralement sous 48 h ouvrées. Vous recevrez un e-mail.
      </p>
      {registrationNumber ? (
        <p className="mt-4 rounded-xl border border-animeo-border-soft bg-animeo-bg px-4 py-3 text-sm text-animeo-dark">
          Numéro transmis : <strong>{registrationNumber}</strong>
        </p>
      ) : null}
    </Card>
  );
}

export function VerificationRejected({ note, registrationNumber }: { note: string | null; registrationNumber: string | null }) {
  const headingRef = useFocusedHeading();
  const router = useRouter();
  const [number, setNumber] = useState(registrationNumber ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const result = await resubmitVerificationAction(number);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <Card className="mx-auto max-w-2xl p-5 sm:p-8">
      <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-black text-animeo-dark outline-none">Votre numéro RNA n’a pas pu être validé</h1>
      {note ? (
        <div className="mt-4 rounded-xl border border-animeo-warning-border bg-animeo-warning-soft px-4 py-3 text-sm text-animeo-dark">
          <p className="text-xs font-extrabold uppercase tracking-[0.1em] text-animeo-warning">Motif</p>
          <p className="mt-1 whitespace-pre-line">{note}</p>
        </div>
      ) : null}
      <p className="mt-4 text-sm text-animeo-muted">Corrigez votre numéro si besoin, puis demandez une nouvelle vérification.</p>
      <form onSubmit={submit} className="mt-4 space-y-4">
        <div>
          <label htmlFor="verification-number" className="mb-1.5 block text-xs font-extrabold uppercase tracking-[0.1em] text-animeo-muted">Numéro RNA (Registre national d’aptitude)</label>
          <input
            id="verification-number"
            value={number}
            onChange={(event) => setNumber(event.target.value)}
            className={inputClassName}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "verification-error" : undefined}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
          />
        </div>
        {error ? <p id="verification-error" role="alert" className="text-sm font-bold text-animeo-danger">{error}</p> : null}
        <Button type="submit" disabled={pending}>{pending ? "Envoi…" : "Demander une nouvelle vérification"}</Button>
      </form>
    </Card>
  );
}
