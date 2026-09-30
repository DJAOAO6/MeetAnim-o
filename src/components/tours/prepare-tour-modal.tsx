"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { createTourFromClientsAction } from "@/lib/tour-runs-actions";
import { formatFrenchDate } from "@/lib/format";
import { notify } from "@/lib/notify";

// Même limite que le serveur (createTourFromClientsAction).
export const MAX_TOUR_FROM_CLIENTS = 25;

function defaultNameFor(dateId: string): string {
  return `Tournée du ${formatFrenchDate(new Date(`${dateId}T00:00:00.000Z`))}`;
}

/**
 * « Préparer une tournée » depuis une sélection de clients sur la carte :
 * crée la journée (départ et retour au cabinet) avec un arrêt par client
 * localisé, puis ouvre Tournées, où elle s'organise (ordre, horaires,
 * rendez-vous). Rien n'est présenté comme un ordre optimal.
 */
export function PrepareTourModal({ clientIds, locatedCount, defaultDateId, onClose }: {
  clientIds: string[];
  locatedCount: number;
  defaultDateId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [dateId, setDateId] = useState(defaultDateId);
  const [name, setName] = useState(() => defaultNameFor(defaultDateId));
  const [nameEdited, setNameEdited] = useState(false);
  const [departureTime, setDepartureTime] = useState("09:00");
  const [submitting, setSubmitting] = useState(false);
  const tooMany = locatedCount > MAX_TOUR_FROM_CLIENTS;
  const unlocated = clientIds.length - locatedCount;

  function changeDate(next: string) {
    setDateId(next);
    if (!nameEdited && /^\d{4}-\d{2}-\d{2}$/.test(next)) setName(defaultNameFor(next));
  }

  async function submit() {
    if (!name.trim() || !dateId || tooMany || locatedCount === 0) return;
    setSubmitting(true);
    const result = await createTourFromClientsAction({ name: name.trim(), dateId, departureTime, clientIds });
    setSubmitting(false);
    if (!result.ok) {
      notify.error(result.error);
      return;
    }
    notify.success(`Journée créée avec ${result.added} arrêt${result.added > 1 ? "s" : ""}.`);
    router.push(`/dashboard/tournees?date=${dateId}`);
  }

  return (
    <Modal
      title="Préparer une tournée"
      description={`${locatedCount} client${locatedCount > 1 ? "s choisis" : " choisi"} : un arrêt par domicile ou par lieu (haras, pension…), dans l’ordre de la sélection. Vous organisez ensuite la journée dans Tournées.`}
      onClose={onClose}
      onSubmit={(event) => { event.preventDefault(); void submit(); }}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>Annuler</Button>
          <Button type="submit" disabled={submitting || !name.trim() || tooMany || locatedCount === 0}>
            {submitting ? "Création…" : "Créer la journée"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label htmlFor="prepare-tour-date" className="mb-1.5 block text-xs font-medium uppercase tracking-[0.08em] text-animeo-muted">Date</label>
          <input id="prepare-tour-date" type="date" value={dateId} onChange={(event) => changeDate(event.target.value)} className="min-h-11 w-full rounded-xl border border-animeo-border bg-white px-3 text-sm text-animeo-dark" />
        </div>
        <div>
          <label htmlFor="prepare-tour-name" className="mb-1.5 block text-xs font-medium uppercase tracking-[0.08em] text-animeo-muted">Nom</label>
          <input id="prepare-tour-name" value={name} onChange={(event) => { setName(event.target.value); setNameEdited(true); }} className="min-h-11 w-full rounded-xl border border-animeo-border bg-white px-3 text-sm text-animeo-dark" />
        </div>
        <div>
          <label htmlFor="prepare-tour-departure" className="mb-1.5 block text-xs font-medium uppercase tracking-[0.08em] text-animeo-muted">Départ du cabinet</label>
          <input id="prepare-tour-departure" type="time" value={departureTime} onChange={(event) => setDepartureTime(event.target.value)} className="min-h-11 w-full rounded-xl border border-animeo-border bg-white px-3 text-sm text-animeo-dark" />
        </div>
        {unlocated > 0 ? (
          <p className="rounded-xl bg-animeo-bg p-3 text-xs text-animeo-dark">
            {unlocated} client{unlocated > 1 ? "s" : ""} sans position ne {unlocated > 1 ? "seront" : "sera"} pas ajouté{unlocated > 1 ? "s" : ""}.
          </p>
        ) : null}
        {tooMany ? (
          <p role="alert" className="rounded-xl bg-animeo-warning-soft p-3 text-xs font-bold text-animeo-dark">
            Une journée compte au plus {MAX_TOUR_FROM_CLIENTS} arrêts : réduisez la sélection ({locatedCount} clients localisés).
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
