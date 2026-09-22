"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { TourRunEndpointPicker, type EndpointValue } from "@/components/tours/tour-run-endpoint-picker";
import { createTourRunAction } from "@/lib/tour-runs-actions";
import { findTourPatternForDateAction, type TourPatternMatch } from "@/lib/tours-actions";
import { formatFrenchDate } from "@/lib/format";
import { notify } from "@/lib/notify";
import type { SavedPlaceView } from "@/lib/tour-runs";

type NewTourDayModalProps = {
  defaultDateId: string;
  savedPlaces: SavedPlaceView[];
  departureKnown: boolean;
  departureLabel: string;
  onClose: () => void;
  onCreated: (dateId: string) => void;
};

function cabinetEndpoint(): EndpointValue {
  return { type: "CABINET", savedPlaceId: null, address: null, latitude: null, longitude: null, label: null };
}

function sameAsStartEndpoint(): EndpointValue {
  return { type: "SAME_AS_START", savedPlaceId: null, address: null, latitude: null, longitude: null, label: null };
}

function defaultNameFor(dateId: string): string {
  return `Tournée du ${formatFrenchDate(new Date(`${dateId}T00:00:00.000Z`))}`;
}

/**
 * Unification des tournées, phase 2 : point de création unique pour une
 * journée — la date est le premier champ (contrairement au formulaire
 * interne de TourRunEditor, où elle vient d'ailleurs). Si la date choisie
 * correspond à un motif actif, propose de reprendre ses réglages sans
 * jamais les appliquer automatiquement.
 */
export function NewTourDayModal({ defaultDateId, savedPlaces, departureKnown, departureLabel, onClose, onCreated }: NewTourDayModalProps) {
  const [dateId, setDateId] = useState(defaultDateId);
  const [name, setName] = useState(() => defaultNameFor(defaultDateId));
  const [departureTime, setDepartureTime] = useState("09:00");
  const [start, setStart] = useState<EndpointValue>(cabinetEndpoint());
  const [end, setEnd] = useState<EndpointValue>(sameAsStartEndpoint());
  const [matchedPattern, setMatchedPattern] = useState<TourPatternMatch | null>(null);
  // Comparé à `dateId` plutôt qu'un simple booléen réinitialisé dans l'effet
  // ci-dessous : redevient naturellement faux dès que la date change, sans
  // setState synchrone dans le corps de l'effet (règle react-hooks/set-state-in-effect).
  const [appliedForDateId, setAppliedForDateId] = useState<string | null>(null);
  const patternApplied = appliedForDateId === dateId;
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateId)) {
      queueMicrotask(() => setMatchedPattern(null));
      return;
    }
    let cancelled = false;
    findTourPatternForDateAction(dateId).then((match) => {
      if (!cancelled) setMatchedPattern(match);
    });
    return () => {
      cancelled = true;
    };
  }, [dateId]);

  function applyPattern() {
    if (!matchedPattern) return;
    setName(matchedPattern.name);
    setDepartureTime(matchedPattern.startTime);
    setStart(
      matchedPattern.startType === "Cabinet"
        ? cabinetEndpoint()
        : { type: "CUSTOM", savedPlaceId: null, address: matchedPattern.startAddress, latitude: matchedPattern.startLatitude, longitude: matchedPattern.startLongitude, label: matchedPattern.startAddress },
    );
    setAppliedForDateId(dateId);
  }

  async function submit() {
    if (!name.trim() || !dateId) return;
    setSubmitting(true);
    const result = await createTourRunAction({ name: name.trim(), dateId, departureTime, start, end });
    setSubmitting(false);
    if (!result.ok) {
      notify.error(result.error);
      return;
    }
    notify.success("Journée créée.");
    onCreated(dateId);
  }

  return (
    <Modal
      title="Nouvelle journée"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Annuler</Button>
          <Button onClick={submit} disabled={submitting || !name.trim()}>
            {submitting ? "Création…" : "Créer la journée"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
          <div>
            <label htmlFor="new-tour-day-date" className="mb-1.5 block text-xs font-medium uppercase tracking-[0.08em] text-animeo-muted">Date</label>
            <input id="new-tour-day-date" type="date" value={dateId} onChange={(event) => setDateId(event.target.value)} className="min-h-11 w-full rounded-xl border border-animeo-border bg-white px-3 text-sm text-animeo-dark" />
          </div>

          {matchedPattern && !patternApplied ? (
            <div className="rounded-xl bg-animeo-soft p-3 text-xs text-animeo-dark">
              <p>Cette date correspond au motif « {matchedPattern.name} ».</p>
              <button type="button" onClick={applyPattern} className="mt-1.5 font-medium text-animeo hover:underline">Reprendre ses réglages</button>
            </div>
          ) : null}

          <div>
            <label htmlFor="new-tour-day-name" className="mb-1.5 block text-xs font-medium uppercase tracking-[0.08em] text-animeo-muted">Nom</label>
            <input id="new-tour-day-name" type="text" value={name} onChange={(event) => setName(event.target.value)} className="min-h-11 w-full rounded-xl border border-animeo-border bg-white px-3 text-sm text-animeo-dark" />
          </div>
          <div>
            <label htmlFor="new-tour-day-departure" className="mb-1.5 block text-xs font-medium uppercase tracking-[0.08em] text-animeo-muted">Heure de départ</label>
            <input id="new-tour-day-departure" type="time" value={departureTime} onChange={(event) => setDepartureTime(event.target.value)} className="min-h-11 w-full rounded-xl border border-animeo-border bg-white px-3 text-sm text-animeo-dark" />
          </div>
          <TourRunEndpointPicker label="Départ" value={start} onChange={setStart} savedPlaces={savedPlaces} departureKnown={departureKnown} departureLabel={departureLabel} />
          <TourRunEndpointPicker label="Arrivée" value={end} onChange={setEnd} savedPlaces={savedPlaces} departureKnown={departureKnown} departureLabel={departureLabel} allowMirrorStart />
        </div>

    </Modal>
  );
}
