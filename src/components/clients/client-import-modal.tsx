"use client";

import { useMemo, useState } from "react";
import { useModalFocusTrap } from "@/components/ui/use-modal-focus-trap";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { ClientImportStepFile, type FileReadResult } from "@/components/clients/client-import-step-file";
import { ClientImportStepColumns } from "@/components/clients/client-import-step-columns";
import { ClientImportStepReview } from "@/components/clients/client-import-step-review";
import { ClientImportStepRun } from "@/components/clients/client-import-step-run";
import type { RunState } from "@/components/clients/client-import-types";
import { prepareRows, type PreparedRow } from "@/lib/import/build-rows";
import { guessMapping, type ImportField } from "@/lib/import/fields";
import {
  startClientImportAction,
  importClientsChunkAction,
  finishClientImportAction,
  undoClientImportAction,
  checkClientMatchesAction,
  type ConflictPolicy,
  type ImportRowPayload,
} from "@/lib/clients-import-actions";
import { notify } from "@/lib/notify";
import type { AnimalSpecies } from "@/data/species";

const CHUNK_SIZE = 200;

type Step = "file" | "columns" | "review" | "run";

const STEP_TITLES: Record<Step, string> = {
  file: "1. Fichier",
  columns: "2. Colonnes",
  review: "3. Vérification",
  run: "4. Import",
};

function toImportRowPayload(row: PreparedRow): ImportRowPayload {
  return {
    lineNumber: row.lineNumber,
    firstName: row.value.firstName,
    lastName: row.value.lastName,
    phone: row.value.phone,
    email: row.value.email,
    address: row.value.address,
    postalCode: row.value.postalCode,
    city: row.value.city,
    status: row.value.status,
    animal: row.value.animal
      ? {
          name: row.value.animal.name,
          species: row.value.animal.species,
          breed: row.value.animal.breed,
          sex: row.value.animal.sex,
          weight: row.value.animal.weight,
          birthDateIso: row.value.animal.birthDateIso,
          birthDateApproximate: row.value.animal.birthDateApproximate,
          conditions: row.value.animal.conditions,
          treatments: row.value.animal.treatments,
          history: row.value.animal.history,
          notes: row.value.animal.notes,
        }
      : null,
  };
}

export function ClientImportModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const [step, setStep] = useState<Step>("file");
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Partial<Record<ImportField, number>>>({});
  const [conflictPolicy, setConflictPolicy] = useState<ConflictPolicy>("COMPLETE");
  const [defaultSpecies, setDefaultSpecies] = useState<AnimalSpecies>("Chien");
  const [excludedLines, setExcludedLines] = useState<Set<number>>(new Set());
  const [existingGroupIndexes, setExistingGroupIndexes] = useState<Set<number> | null>(null);
  const [checkingMatches, setCheckingMatches] = useState(false);

  const [importId, setImportId] = useState<string | null>(null);
  const [runState, setRunState] = useState<RunState | null>(null);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);

  const { prepared, groups } = useMemo(() => prepareRows(rawRows, mapping, { defaultSpecies }), [rawRows, mapping, defaultSpecies]);
  const hasUnrecognizedSpecies = useMemo(
    () => prepared.some((row) => row.value.animal && !row.value.animal.speciesRecognized),
    [prepared],
  );

  const importInProgress = runState !== null && ["running", "finishing", "chunk_failed", "undoing"].includes(runState.phase);

  function requestClose() {
    if (importInProgress) {
      setCloseConfirmOpen(true);
      return;
    }
    onClose();
  }

  const dialogRef = useModalFocusTrap<HTMLElement>(requestClose);

  function handleFileRead(result: FileReadResult) {
    setFileName(result.fileName);
    setHeaders(result.headers);
    setRawRows(result.rows);
    setMapping(guessMapping(result.headers));
    setStep("columns");
  }

  async function goToReview() {
    setStep("review");
    setExistingGroupIndexes(null);
    setCheckingMatches(true);

    const candidates = groups.map((group) => ({
      lineNumber: group.lineNumbers[0],
      firstName: group.client.firstName,
      lastName: group.client.lastName,
      phone: group.client.phone,
      email: group.client.email,
      city: group.client.city,
    }));

    const result = await checkClientMatchesAction(candidates);
    setCheckingMatches(false);
    if (!result.ok) {
      notify.error(result.error);
      return;
    }

    const firstLineToGroupIndex = new Map(groups.map((group, index) => [group.lineNumbers[0], index]));
    const existing = new Set<number>();
    for (const match of result.matches) {
      if (!match.existing) continue;
      const groupIndex = firstLineToGroupIndex.get(match.lineNumber);
      if (groupIndex !== undefined) existing.add(groupIndex);
    }
    setExistingGroupIndexes(existing);
  }

  function toggleExclude(lineNumber: number) {
    setExcludedLines((current) => {
      const next = new Set(current);
      if (next.has(lineNumber)) next.delete(lineNumber);
      else next.add(lineNumber);
      return next;
    });
  }

  async function startImport() {
    const payloadRows = prepared.filter((row) => !excludedLines.has(row.lineNumber)).map(toImportRowPayload);
    if (payloadRows.length === 0) return;

    setStep("run");
    setRunState({ phase: "running", done: 0, total: payloadRows.length });

    const startResult = await startClientImportAction({ fileName, totalRows: payloadRows.length, conflictPolicy });
    if (!startResult.ok) {
      setRunState({ phase: "chunk_failed", done: 0, total: payloadRows.length, error: startResult.error });
      return;
    }
    setImportId(startResult.importId);
    await runChunks(startResult.importId, payloadRows, 0);
  }

  async function runChunks(currentImportId: string, payloadRows: ImportRowPayload[], startIndex: number) {
    for (let index = startIndex; index < payloadRows.length; index += CHUNK_SIZE) {
      const chunk = payloadRows.slice(index, index + CHUNK_SIZE);
      const result = await importClientsChunkAction(currentImportId, chunk);
      if (!result.ok) {
        setRunState({ phase: "chunk_failed", done: index, total: payloadRows.length, error: result.error });
        return;
      }
      setRunState({ phase: "running", done: Math.min(index + CHUNK_SIZE, payloadRows.length), total: payloadRows.length });
    }

    setRunState({ phase: "finishing", total: payloadRows.length });
    const finishResult = await finishClientImportAction(currentImportId);
    if (!finishResult.ok) {
      setRunState({ phase: "chunk_failed", done: payloadRows.length, total: payloadRows.length, error: finishResult.error });
      return;
    }

    setRunState({ phase: "done", summary: finishResult.summary });
    const total = finishResult.summary.createdClients + finishResult.summary.mergedClients;
    notify.success(`${total} client${total > 1 ? "s" : ""} importé${total > 1 ? "s" : ""}.`);
    onImported();
  }

  function resumeImport() {
    if (!importId || !runState || runState.phase !== "chunk_failed") return;
    const payloadRows = prepared.filter((row) => !excludedLines.has(row.lineNumber)).map(toImportRowPayload);
    setRunState({ phase: "running", done: runState.done, total: runState.total });
    void runChunks(importId, payloadRows, runState.done);
  }

  const [undoConfirmOpen, setUndoConfirmOpen] = useState(false);

  async function confirmUndo() {
    setUndoConfirmOpen(false);
    if (!importId) return;
    setRunState({ phase: "undoing" });
    const result = await undoClientImportAction(importId);
    if (!result.ok) {
      notify.error(result.error);
      setRunState({ phase: "done", summary: { importId, createdClients: 0, createdAnimals: 0, mergedClients: 0, skippedRows: 0, errorRows: 0 } });
      return;
    }
    setRunState({
      phase: "undone",
      deletedClients: result.deleted.clients,
      deletedAnimals: result.deleted.animals,
      preservedClients: result.preserved.clients,
    });
    notify.success("L'import a été annulé.");
    onImported();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#102f37]/60 p-0 backdrop-blur-sm sm:p-4">
      <section
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="client-import-dialog-title"
        className="flex h-full w-full max-w-4xl flex-col overflow-hidden bg-white shadow-[0_24px_70px_rgba(12,39,47,0.3)] outline-none sm:h-auto sm:max-h-[92vh] sm:rounded-[18px]"
      >
        <div className="flex items-start justify-between gap-4 border-b border-[#e5eeeb] p-5 sm:p-6">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-animeo">Import de clients</p>
            <h2 id="client-import-dialog-title" className="mt-1 text-xl font-black text-animeo-dark">{STEP_TITLES[step]}</h2>
          </div>
          <button type="button" onClick={requestClose} aria-label="Fermer" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-animeo-bg text-xl text-animeo-muted">×</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 sm:p-6">
          {step === "file" ? <ClientImportStepFile onFileRead={handleFileRead} /> : null}

          {step === "columns" ? (
            <ClientImportStepColumns
              headers={headers}
              rawRows={rawRows}
              mapping={mapping}
              onMappingChange={setMapping}
              onBack={() => setStep("file")}
              onContinue={() => void goToReview()}
            />
          ) : null}

          {step === "review" ? (
            checkingMatches ? (
              <p className="py-10 text-center text-sm font-bold text-animeo-muted">Vérification des fiches déjà existantes…</p>
            ) : (
              <ClientImportStepReview
                prepared={prepared}
                conflictPolicy={conflictPolicy}
                onConflictPolicyChange={setConflictPolicy}
                defaultSpecies={defaultSpecies}
                onDefaultSpeciesChange={setDefaultSpecies}
                hasUnrecognizedSpecies={hasUnrecognizedSpecies}
                excludedLines={excludedLines}
                onToggleExclude={toggleExclude}
                existingGroupIndexes={existingGroupIndexes}
                onBack={() => setStep("columns")}
                onStartImport={() => void startImport()}
              />
            )
          ) : null}

          {step === "run" && runState ? (
            <ClientImportStepRun
              runState={runState}
              onResume={resumeImport}
              onUndo={() => setUndoConfirmOpen(true)}
              onViewClients={onClose}
            />
          ) : null}
        </div>
      </section>

      {closeConfirmOpen ? (
        <ConfirmModal
          title="Interrompre l'import ?"
          message="L'import en cours sera interrompu. Les fiches déjà créées resteront en base — vous pourrez reprendre ou annuler l'import plus tard depuis cette même fenêtre."
          confirmLabel="Interrompre"
          onConfirm={() => {
            setCloseConfirmOpen(false);
            onClose();
          }}
          onClose={() => setCloseConfirmOpen(false)}
        />
      ) : null}

      {undoConfirmOpen ? (
        <ConfirmModal
          title="Annuler cet import ?"
          message="Les fiches créées par cet import seront supprimées, sauf celles ayant reçu un rendez-vous, une consultation ou un rappel depuis. Cette action est irréversible."
          confirmLabel="Annuler l'import"
          onConfirm={() => void confirmUndo()}
          onClose={() => setUndoConfirmOpen(false)}
        />
      ) : null}
    </div>
  );
}
