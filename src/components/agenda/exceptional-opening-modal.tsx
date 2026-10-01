"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { inputClassName } from "@/components/settings/settings-fields";
import type { ExceptionalClosure, ExceptionalOpening } from "@/data/settings";
import { hasCabinet, visitsHomes, type PracticeMode } from "@/lib/practice-mode";

type OpeningMode = "cabinet" | "home" | "both";

const modeLabels: Record<OpeningMode, string> = { cabinet: "Cabinet", home: "Domicile", both: "Les deux" };

/**
 * « Ouvrir exceptionnellement » depuis l'agenda : une plage ouverte ce jour-là
 * seulement, horaires repris de la sélection et modifiables.
 *
 * Si la sélection tombe dans une fermeture ponctuelle d'un seul jour (celle
 * que crée « Indisponible / Fermé »), poser une ouverture par-dessus serait
 * illisible : la fenêtre propose plutôt de rouvrir la sélection dans cette
 * fermeture, ou de la retirer.
 */
export function ExceptionalOpeningModal({ date, dateLabel, start, end, practiceMode, closedModes, closuresUnder, onOpen, onReopenClosures, onClose }: {
  date: string;
  dateLabel: string;
  start: string;
  end: string;
  practiceMode: PracticeMode;
  /** Modes fermés à cet endroit : présélectionnés. */
  closedModes: { cabinet: boolean; home: boolean };
  closuresUnder: ExceptionalClosure[];
  onOpen: (opening: ExceptionalOpening) => Promise<string | null>;
  onReopenClosures: (how: "trim" | "remove") => Promise<string | null>;
  onClose: () => void;
}) {
  const practiced = { cabinet: hasCabinet(practiceMode), home: visitsHomes(practiceMode) };
  const choices: OpeningMode[] = practiced.cabinet && practiced.home ? ["cabinet", "home", "both"] : practiced.cabinet ? ["cabinet"] : ["home"];
  const preselected: OpeningMode = choices.length === 1
    ? choices[0]
    : closedModes.cabinet && !closedModes.home ? "cabinet" : closedModes.home && !closedModes.cabinet ? "home" : "both";
  const [draft, setDraft] = useState({ start, end, mode: preselected, reason: "" });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function run(action: () => Promise<string | null>) {
    setPending(true);
    setError(null);
    const problem = await action();
    setPending(false);
    if (problem) setError(problem);
  }

  if (closuresUnder.length > 0) {
    const closure = closuresUnder[0];
    return (
      <Modal
        title="Rouvrir ce créneau"
        description={`${dateLabel} : ce créneau est fermé par « ${closure.reason || "Fermeture"} », de ${closure.start} à ${closure.end}.`}
        onClose={onClose}
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={onClose} disabled={pending}>Annuler</Button>
            <Button variant="secondary" onClick={() => run(() => onReopenClosures("remove"))} disabled={pending}>Retirer toute la fermeture</Button>
            <Button onClick={() => run(() => onReopenClosures("trim"))} disabled={pending}>Rouvrir de {start} à {end}</Button>
          </>
        }
      >
        {error ? <p role="alert" className="rounded-xl bg-animeo-danger-soft px-4 py-3 text-sm font-bold text-animeo-error">{error}</p> : null}
        <p className="text-sm text-animeo-muted">Plutôt qu’une ouverture par-dessus cette fermeture, rouvrez seulement la sélection, ou retirez la fermeture entière.</p>
      </Modal>
    );
  }

  function submit() {
    if (!draft.start || !draft.end || draft.start >= draft.end) return setError("L’heure de fin doit suivre l’heure de début.");
    void run(() => onOpen({
      id: `opening-${Date.now()}`,
      date,
      start: draft.start,
      end: draft.end,
      cabinet: draft.mode !== "home",
      home: draft.mode !== "cabinet",
      reason: draft.reason.trim(),
    }));
  }

  return (
    <Modal
      title="Ouvrir exceptionnellement"
      description={`${dateLabel} : ce créneau sera proposé à la réservation, ce jour-là seulement.`}
      onClose={onClose}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>Annuler</Button>
          <Button onClick={submit} disabled={pending}>{pending ? "Enregistrement…" : "Ouvrir"}</Button>
        </>
      }
    >
      <div className="space-y-4">
        {error ? <p role="alert" className="rounded-xl bg-animeo-danger-soft px-4 py-3 text-sm font-bold text-animeo-error">{error}</p> : null}
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1.5 block text-xs font-extrabold uppercase tracking-[0.11em] text-animeo-muted">De</span>
            <input type="time" value={draft.start} onChange={(event) => setDraft((current) => ({ ...current, start: event.target.value }))} className={inputClassName} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-extrabold uppercase tracking-[0.11em] text-animeo-muted">À</span>
            <input type="time" value={draft.end} onChange={(event) => setDraft((current) => ({ ...current, end: event.target.value }))} className={inputClassName} />
          </label>
        </div>
        {choices.length > 1 ? (
          <fieldset>
            <legend className="mb-1.5 text-xs font-extrabold uppercase tracking-[0.11em] text-animeo-muted">Ouvert pour</legend>
            <div className="flex flex-wrap gap-2">
              {choices.map((choice) => (
                <label key={choice} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm font-bold ${draft.mode === choice ? "border-animeo bg-animeo-soft text-animeo-dark" : "border-animeo-border text-animeo-muted"}`}>
                  <input type="radio" name="opening-mode" checked={draft.mode === choice} onChange={() => setDraft((current) => ({ ...current, mode: choice }))} className="h-4 w-4 accent-[var(--theme-brand)]" />
                  {modeLabels[choice]}
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}
        <label className="block">
          <span className="mb-1.5 block text-xs font-extrabold uppercase tracking-[0.11em] text-animeo-muted">Motif (facultatif)</span>
          <input type="text" value={draft.reason} maxLength={120} onChange={(event) => setDraft((current) => ({ ...current, reason: event.target.value }))} className={inputClassName} placeholder="Ex. Rattrapage, urgence…" />
        </label>
      </div>
    </Modal>
  );
}
