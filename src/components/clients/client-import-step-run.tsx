"use client";

import type { RunState } from "@/components/clients/client-import-types";

export function ClientImportStepRun({
  runState,
  onResume,
  onUndo,
  onViewClients,
}: {
  runState: RunState;
  onResume: () => void;
  onUndo: () => void;
  onViewClients: () => void;
}) {
  if (runState.phase === "running" || runState.phase === "finishing") {
    const done = runState.phase === "finishing" ? runState.total : runState.done;
    const total = runState.total;
    const percent = total > 0 ? Math.round((done / total) * 100) : 0;
    return (
      <div className="space-y-4 py-6">
        <div className="h-3 w-full overflow-hidden rounded-full bg-animeo-bg">
          <div className="h-full rounded-full bg-animeo transition-all" style={{ width: `${percent}%` }} />
        </div>
        <p aria-live="polite" className="text-center text-sm font-bold text-animeo-dark">
          {runState.phase === "finishing" ? "Finalisation…" : `${done} / ${total} lignes traitées`}
        </p>
      </div>
    );
  }

  if (runState.phase === "chunk_failed") {
    return (
      <div className="space-y-4 py-6">
        <p aria-live="polite" className="text-center text-sm font-bold text-animeo-dark">{runState.done} / {runState.total} lignes traitées avant l&apos;interruption</p>
        <p role="alert" className="rounded-xl bg-[#fff1f1] px-4 py-3 text-center text-sm font-bold text-animeo-error">{runState.error}</p>
        <p className="text-center text-xs text-animeo-muted">Les lignes déjà traitées sont conservées. Vous pouvez reprendre l&apos;import là où il s&apos;est arrêté, ou l&apos;annuler entièrement.</p>
        <div className="flex flex-col-reverse justify-center gap-2 sm:flex-row">
          <button type="button" onClick={onUndo} className="rounded-xl border border-[#d4e2df] px-5 py-2.5 text-sm font-extrabold text-animeo-dark transition hover:bg-animeo-bg">
            Annuler cet import
          </button>
          <button type="button" onClick={onResume} className="rounded-xl bg-animeo px-6 py-2.5 text-sm font-extrabold text-white transition hover:bg-[#459e90]">
            Reprendre
          </button>
        </div>
      </div>
    );
  }

  if (runState.phase === "undoing") {
    return <p className="py-10 text-center text-sm font-bold text-animeo-muted">Annulation de l&apos;import en cours…</p>;
  }

  if (runState.phase === "undone") {
    return (
      <div className="space-y-4 py-6 text-center">
        <p className="font-extrabold text-animeo-dark">Import annulé</p>
        <p className="text-sm text-animeo-muted">
          {runState.deletedClients} fiche{runState.deletedClients > 1 ? "s" : ""} supprimée{runState.deletedClients > 1 ? "s" : ""}
          {runState.deletedAnimals > 0 ? `, ${runState.deletedAnimals} animal${runState.deletedAnimals > 1 ? "aux" : ""}` : ""}.
          {runState.preservedClients > 0 ? ` ${runState.preservedClients} fiche${runState.preservedClients > 1 ? "s" : ""} conservée${runState.preservedClients > 1 ? "s" : ""} car un rendez-vous, une consultation ou un rappel y a été rattaché depuis.` : ""}
        </p>
        <button type="button" onClick={onViewClients} className="rounded-xl bg-animeo px-6 py-2.5 text-sm font-extrabold text-white transition hover:bg-[#459e90]">
          Voir mes clients
        </button>
      </div>
    );
  }

  // runState.phase === "done"
  const { summary } = runState;
  return (
    <div className="space-y-5 py-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <ResultCounter label="Clients créés" value={summary.createdClients} />
        <ResultCounter label="Animaux créés" value={summary.createdAnimals} />
        <ResultCounter label="Fiches complétées" value={summary.mergedClients} />
        <ResultCounter label="Lignes ignorées" value={summary.skippedRows + summary.errorRows} />
      </div>

      <p className="rounded-xl bg-animeo-bg px-4 py-3 text-xs text-animeo-muted">
        Les clients importés n&apos;ont pas encore de position sur la carte des tournées — utilisez le bouton « Localiser » sur chaque fiche pour la calculer, à votre rythme.
      </p>

      <div className="flex flex-col-reverse justify-end gap-2 border-t border-[#e5eeeb] pt-5 sm:flex-row">
        <button type="button" onClick={onUndo} className="rounded-xl border border-[#d4e2df] px-5 py-2.5 text-sm font-extrabold text-animeo-dark transition hover:bg-animeo-bg">
          Annuler cet import
        </button>
        <button type="button" onClick={onViewClients} className="rounded-xl bg-animeo px-6 py-2.5 text-sm font-extrabold text-white transition hover:bg-[#459e90]">
          Voir mes clients
        </button>
      </div>
    </div>
  );
}

function ResultCounter({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-animeo-bg p-4">
      <p className="text-2xl font-black leading-none text-animeo-dark">{value}</p>
      <p className="mt-1.5 text-xs font-bold text-animeo-muted">{label}</p>
    </div>
  );
}
