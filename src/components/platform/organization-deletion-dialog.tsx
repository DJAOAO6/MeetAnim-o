"use client";

import { useEffect, useState, useTransition } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { getDeletionInventoryAction, purgeOrganizationNowAction, scheduleOrganizationDeletionAction, type DeletionInventory } from "@/lib/platform/organization-actions";
import { DELETION_REASONS, type DeletionReasonKey } from "@/lib/deletion-reasons";

const fieldClassName = "mt-1 min-h-11 w-full rounded-xl border border-animeo-border bg-white px-3 text-sm text-animeo-dark";

/**
 * Suppression d'un espace : ce qui sera effacé, l'export à remettre au
 * professionnel avant, le motif, et le nom de l'espace tapé à l'identique.
 * Par défaut, l'effacement est programmé à 7 jours (annulable) ; « Effacer
 * immédiatement » est réservé à une demande explicite du professionnel et
 * demande une seconde confirmation.
 */
export function OrganizationDeletionDialog({ organizationId, organizationName, onClose }: { organizationId: string; organizationName: string; onClose: () => void }) {
  const [inventory, setInventory] = useState<DeletionInventory | null>(null);
  const [reason, setReason] = useState<DeletionReasonKey | "">("");
  const [typedName, setTypedName] = useState("");
  const [immediate, setImmediate] = useState(false);
  const [confirmingImmediate, setConfirmingImmediate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // Date annoncée, fixée à l'ouverture de la fenêtre.
  const [plannedDate] = useState(() => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));

  useEffect(() => {
    let cancelled = false;
    void getDeletionInventoryAction(organizationId).then((result) => {
      if (cancelled) return;
      if (result.ok) setInventory(result.inventory);
      else setError(result.error);
    });
    return () => { cancelled = true; };
  }, [organizationId]);

  const nameMatches = typedName.trim() === organizationName.trim();

  function submit() {
    setError(null);
    if (!immediate && !reason) return setError("Choisissez le motif de la suppression.");
    if (!nameMatches) return setError("Tapez le nom exact de l’espace pour confirmer.");
    if (immediate && !confirmingImmediate) return setConfirmingImmediate(true);
    startTransition(async () => {
      const result = immediate
        ? await purgeOrganizationNowAction(organizationId, typedName, true)
        : await scheduleOrganizationDeletionAction(organizationId, reason, typedName);
      if (!result.ok) {
        setConfirmingImmediate(false);
        return setError(result.error);
      }
      onClose();
    });
  }

  const submitLabel = immediate
    ? (confirmingImmediate ? "Effacer définitivement maintenant" : "Effacer immédiatement…")
    : "Programmer la suppression";

  return (
    <Modal
      title={`Supprimer ${organizationName}`}
      description="L’espace est suspendu aussitôt. Ses données sont effacées partout — base, comptes, journaux, Google Agenda, Mailjet — sans retour possible."
      onClose={onClose}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>Annuler</Button>
          <Button variant="danger" onClick={submit} disabled={pending}>{pending ? "En cours…" : submitLabel}</Button>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        {error ? <p role="alert" className="rounded-xl bg-animeo-danger-soft px-4 py-3 font-bold text-animeo-error">{error}</p> : null}

        <section aria-label="Ce qui sera effacé">
          <h3 className="font-extrabold text-animeo-dark">Ce qui sera effacé</h3>
          {inventory ? (
            <ul className="mt-1 grid grid-cols-2 gap-x-4 text-animeo-dark sm:grid-cols-3">
              <li>{inventory.users} compte{inventory.users > 1 ? "s" : ""}</li>
              <li>{inventory.clients} client{inventory.clients > 1 ? "s" : ""}</li>
              <li>{inventory.animals} anima{inventory.animals > 1 ? "ux" : "l"}</li>
              <li>{inventory.appointments} rendez-vous</li>
              <li>{inventory.documents} document{inventory.documents > 1 ? "s" : ""}</li>
            </ul>
          ) : <p className="mt-1 text-animeo-muted">Inventaire en cours…</p>}
        </section>

        <section className="rounded-xl bg-animeo-bg p-3">
          <p className="text-animeo-dark">Avant d’effacer, téléchargez l’export pour le remettre au professionnel : un ZIP avec toutes les données de l’espace (JSON, tableaux CSV, comptes rendus PDF). Il n’est conservé nulle part.</p>
          <a href={`/plateforme/export/${organizationId}`} download className="mt-2 inline-flex min-h-10 items-center rounded-xl border border-animeo-border bg-white px-3 font-extrabold text-animeo-dark hover:bg-animeo-soft">
            Télécharger l’export
          </a>
        </section>

        <label className="block">
          <span className="font-extrabold text-animeo-dark">Motif</span>
          <select value={immediate ? "PROFESSIONAL_REQUEST" : reason} disabled={immediate} onChange={(event) => setReason(event.target.value as DeletionReasonKey | "")} className={fieldClassName}>
            <option value="">Choisir…</option>
            {(Object.keys(DELETION_REASONS) as DeletionReasonKey[]).map((key) => <option key={key} value={key}>{DELETION_REASONS[key]}</option>)}
          </select>
        </label>

        <label className="block">
          <span className="font-extrabold text-animeo-dark">Nom de l’espace, à taper à l’identique</span>
          <input value={typedName} onChange={(event) => setTypedName(event.target.value)} placeholder={organizationName} autoComplete="off" className={fieldClassName} />
        </label>

        <label className="flex items-start gap-2.5">
          <input type="checkbox" checked={immediate} onChange={(event) => { setImmediate(event.target.checked); setConfirmingImmediate(false); }} className="mt-0.5 h-4 w-4 accent-[var(--theme-brand)]" />
          <span className="text-animeo-dark">Effacer immédiatement (demande explicite du professionnel), sans le délai de 7 jours</span>
        </label>

        {immediate && confirmingImmediate ? (
          <p role="alert" className="rounded-xl border border-animeo-error bg-animeo-danger-soft px-4 py-3 font-bold text-animeo-error">
            Dernière confirmation : tout sera effacé maintenant, sans aucun moyen de revenir en arrière.
          </p>
        ) : !immediate ? (
          <p className="text-animeo-muted">Sans effacement immédiat : suppression le {new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(plannedDate)}, annulable d’ici là. Le professionnel est prévenu par email.</p>
        ) : null}
      </div>
    </Modal>
  );
}
